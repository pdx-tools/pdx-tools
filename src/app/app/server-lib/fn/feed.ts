import { dbDifficulty, table, userView } from "@/server-lib/db";
import type { Eu5Save, Save } from "@/server-lib/db";
import { userId } from "@/lib/auth";
import { and, count, desc, eq, gt, lt, notExists, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { DbConnection } from "../db/connection";

export const FeedGame = z.enum(["eu4", "eu5"]);
export type FeedGame = z.infer<typeof FeedGame>;

export const FeedSchema = z.object({
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .nullish()
    .transform((x) => x ?? 25),
  /** Latest upload of the last campaign on the previous page, as ISO 8601. */
  cursor: z
    .string()
    .datetime({ offset: true })
    .nullish()
    .transform((x) => (x ? new Date(x) : undefined)),
  game: FeedGame.nullish(),
});

export type FeedParams = z.infer<typeof FeedSchema>;

export const CampaignSchema = z.object({
  game: FeedGame,
  key: z.string().min(1),
});

const Contributor = z.object({ user_id: z.string().transform(userId), user_name: z.string() });
export type FeedContributor = z.infer<typeof Contributor>;

type SaveTable = typeof table.eu4Saves | typeof table.eu5Saves;

type SaveColumns = {
  playthroughId: AnyPgColumn;
  players: AnyPgColumn;
  userId: AnyPgColumn;
};

type GameConfig = {
  game: FeedGame;
  table: SaveTable;
  /** Position of a save within its campaign, on `table`. */
  ordinal: SQL;
};

/**
 * A campaign is one playthrough id. Saves from different uploaders belong
 * to the same campaign only when the save is multiplayer; a single-player
 * campaign is scoped to its uploader so that two solo players who share a
 * playthrough id stay apart.
 */
function campaignKey(s: SaveColumns): SQL<string> {
  return sql<string>`${s.playthroughId} || CASE WHEN cardinality(${s.players}) > 1 THEN '' ELSE ':' || ${s.userId} END`;
}

/** The playthrough id that a campaign key was built from. */
function keyPlaythrough(key: string): string {
  return key.split(":", 1)[0] ?? key;
}

const eu4: GameConfig = {
  game: "eu4",
  table: table.eu4Saves,
  ordinal: sql`${table.eu4Saves.days}`,
};

const eu5: GameConfig = {
  game: "eu5",
  table: table.eu5Saves,
  // EU5 dates are `y.m.d` strings.
  ordinal: sql`split_part(${table.eu5Saves.date}, '.', 1)::int * 10000 + split_part(${table.eu5Saves.date}, '.', 2)::int * 100 + split_part(${table.eu5Saves.date}, '.', 3)::int`,
};

const games = { eu4, eu5 };

/**
 * The newest save of each campaign, newest first, one more than a page so
 * that the caller knows whether a next page exists.
 *
 * The scan walks `created_on` backwards and keeps a save only when the
 * campaign has no newer save. The anti-join looks the campaign up through
 * the playthrough index, so the scan stops as soon as the page is full
 * instead of aggregating every save.
 */
function latestSaves(
  db: DbConnection,
  { game, table: saves }: GameConfig,
  { pageSize, cursor }: FeedParams,
) {
  const s = alias(saves, "s");
  const newer = alias(saves, "newer");
  return db
    .select({
      game: sql<FeedGame>`${sql.raw(`'${game}'`)}`.as("game"),
      id: s.id,
      playthroughId: s.playthroughId,
      userId: s.userId,
      campaignKey: campaignKey(s).as("campaign_key"),
      createdOn: s.createdOn,
    })
    .from(s)
    .where(
      and(
        cursor && lt(s.createdOn, cursor),
        notExists(
          db
            .select({ one: sql`1` })
            .from(newer)
            .where(
              and(
                eq(newer.playthroughId, s.playthroughId),
                eq(campaignKey(newer), campaignKey(s)),
                gt(newer.createdOn, s.createdOn),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(s.createdOn))
    .limit(pageSize + 1);
}

/** One page of shared campaigns across games, ordered by latest upload. */
function feedQuery(db: DbConnection, params: FeedParams) {
  const eu4Latest = latestSaves(db, eu4, params);
  const eu5Latest = latestSaves(db, eu5, params);
  const latest =
    params.game === "eu4"
      ? eu4Latest
      : params.game === "eu5"
        ? eu5Latest
        : eu4Latest
            .unionAll(eu5Latest)
            .orderBy(desc(sql`created_on`))
            .limit(params.pageSize + 1);
  const page = db.$with("page").as(latest);

  // Aggregates over every save of the campaigns on the page. Each game
  // contributes its own rows, joined back through the playthrough index.
  const stats = ({ game, table: s, ordinal }: GameConfig) =>
    db
      .select({
        // Named apart from `page.game`: drizzle refers to an aliased SQL
        // field by its bare name, and a join on `"game" = "game"` is
        // ambiguous.
        latestGame: sql<FeedGame>`${page.game}`.as("latest_game"),
        latestId: page.id,
        saveCount: count().as("save_count"),
        firstDate: sql<string>`(array_agg(${s.date} ORDER BY ${ordinal}))[1]`.as("first_date"),
        latestDate: sql<string>`(array_agg(${s.date} ORDER BY ${ordinal} DESC))[1]`.as(
          "latest_date",
        ),
        contributors:
          sql<unknown>`jsonb_agg(DISTINCT jsonb_build_object('user_id', ${table.users.userId}, 'user_name', ${userView.userName}))`.as(
            "contributors",
          ),
      })
      .from(page)
      .innerJoin(
        s,
        and(eq(s.playthroughId, page.playthroughId), eq(campaignKey(s), page.campaignKey)),
      )
      .innerJoin(table.users, eq(table.users.userId, s.userId))
      .where(eq(page.game, game))
      .groupBy(page.game, page.id);
  const campaigns = db.$with("campaigns").as(stats(eu4).unionAll(stats(eu5)));

  return db
    .with(page, campaigns)
    .select({
      game: page.game,
      key: page.campaignKey,
      latestUpload: page.createdOn,
      saveCount: campaigns.saveCount,
      firstDate: campaigns.firstDate,
      latestDate: campaigns.latestDate,
      contributors: campaigns.contributors,
      userName: userView.userName,
      eu4: table.eu4Saves,
      eu5: table.eu5Saves,
    })
    .from(page)
    .innerJoin(campaigns, and(eq(campaigns.latestGame, page.game), eq(campaigns.latestId, page.id)))
    .innerJoin(table.users, eq(table.users.userId, page.userId))
    .leftJoin(table.eu4Saves, and(eq(page.game, "eu4"), eq(table.eu4Saves.id, page.id)))
    .leftJoin(table.eu5Saves, and(eq(page.game, "eu5"), eq(table.eu5Saves.id, page.id)))
    .orderBy(desc(page.createdOn));
}

type FeedRow = Awaited<ReturnType<typeof feedQuery>>[number];

function toEu4Save(save: Save, userName: string) {
  return {
    game: "eu4" as const,
    id: save.id,
    upload_time: save.createdOn.toISOString(),
    date: save.date,
    filename: save.filename,
    playthrough_id: save.playthroughId,
    player_tag: save.playerTag,
    player_tag_name: save.playerTagName,
    player_start_tag: save.playerStartTag,
    player_start_tag_name: save.playerStartTagName,
    patch: `${save.saveVersionFirst}.${save.saveVersionSecond}.${save.saveVersionThird}.${save.saveVersionFourth}`,
    game_difficulty: dbDifficulty(save.gameDifficulty),
    achievements: save.achieveIds,
    leaderboard_qualified: save.leaderboardQualified,
    players: save.players.length,
    user_id: save.userId,
    user_name: userName,
  };
}

function toEu5Save(save: Eu5Save, userName: string) {
  return {
    game: "eu5" as const,
    id: save.id,
    upload_time: save.createdOn.toISOString(),
    date: save.date,
    filename: save.filename,
    playthrough_id: save.playthroughId,
    playthrough_name: save.playthroughName,
    players: save.players,
    version_major: save.versionMajor,
    version_minor: save.versionMinor,
    version_patch: save.versionPatch,
    user_id: save.userId,
    user_name: userName,
  };
}

export type FeedSave = ReturnType<typeof toEu4Save> | ReturnType<typeof toEu5Save>;

function toCampaign(row: FeedRow) {
  const latest =
    row.game === "eu4" && row.eu4
      ? toEu4Save(row.eu4, row.userName)
      : row.game === "eu5" && row.eu5
        ? toEu5Save(row.eu5, row.userName)
        : undefined;
  if (latest === undefined) {
    throw new Error(`feed row ${row.key} has no ${row.game} save`);
  }

  const contributors = z.array(Contributor).parse(row.contributors);
  const others = contributors.filter((x) => x.user_id !== latest.user_id);
  return {
    game: row.game,
    key: row.key,
    name: campaignName(latest),
    multiplayer: latest.game === "eu4" ? latest.players > 1 : latest.players.length > 1,
    save_count: row.saveCount,
    latest_upload: row.latestUpload.toISOString(),
    first_date: row.firstDate,
    latest_date: row.latestDate,
    // The latest uploader leads; the rest follow in name order.
    contributors: [{ user_id: latest.user_id, user_name: latest.user_name }, ...others],
    latest,
  };
}

export type FeedCampaign = ReturnType<typeof toCampaign>;

function campaignName(save: FeedSave): string {
  return save.game === "eu5" ? save.playthrough_name : (save.player_tag_name ?? save.player_tag);
}

/**
 * One page of shared campaigns across games, ordered by each campaign's
 * latest upload.
 */
export async function getFeed(db: DbConnection, params: FeedParams) {
  const rows = await feedQuery(db, params);
  const campaigns = rows.slice(0, params.pageSize).map(toCampaign);
  const cursor = rows.length > params.pageSize ? campaigns.at(-1)?.latest_upload : undefined;
  return { campaigns, cursor };
}

/** Every save of one campaign, newest upload first. */
export async function getCampaignSaves(
  db: DbConnection,
  { game, key }: z.infer<typeof CampaignSchema>,
) {
  const { table: s } = games[game];
  // The playthrough id lets the lookup use its index; the key does the rest.
  const where = and(eq(s.playthroughId, keyPlaythrough(key)), eq(campaignKey(s), key));
  const order = desc(s.createdOn);
  const userName = userView.userName;
  const join = eq(table.users.userId, s.userId);

  const saves: FeedSave[] =
    game === "eu4"
      ? (
          await db
            .select({ save: table.eu4Saves, userName })
            .from(table.eu4Saves)
            .innerJoin(table.users, join)
            .where(where)
            .orderBy(order)
            .limit(200)
        ).map((row) => toEu4Save(row.save, row.userName))
      : (
          await db
            .select({ save: table.eu5Saves, userName })
            .from(table.eu5Saves)
            .innerJoin(table.users, join)
            .where(where)
            .orderBy(order)
            .limit(200)
        ).map((row) => toEu5Save(row.save, row.userName));
  return { saves };
}
