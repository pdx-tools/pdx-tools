import { eu4Saves, eu5Saves, users } from "./schema";
import type { GameDifficulty, Save } from "./schema";
import type { ParsedFile } from "../functions";
import { sql, eq, and, isNotNull, inArray, asc, desc } from "drizzle-orm";
import { NotFoundError } from "../errors";
import type { Achievement } from "@/wasm/wasm_app";
import { eu4DaysToDate } from "../game";
import type { DbConnection } from "./connection";
import type { UserId } from "@/lib/auth";
export {
  type User,
  type Save,
  type GameDifficulty,
  type NewSave,
  type Eu5Save,
  type NewEu5Save,
} from "./schema";

export const userView = {
  get userName() {
    return sql<string>`COALESCE(NULLIF(${table.users.display}, ''), NULLIF(${table.users.steamName}, ''), 'unknown')`;
  },
};

export function saveView<S, U>(opts?: { save?: S; user?: U }) {
  const saveColumns = {
    id: table.eu4Saves.id,
    upload_time: table.eu4Saves.createdOn,
    date: table.eu4Saves.date,
    player_tag: table.eu4Saves.playerTag,
    player_tag_name: table.eu4Saves.playerTagName,
    player_start_tag: table.eu4Saves.playerStartTag,
    player_start_tag_name: table.eu4Saves.playerStartTagName,
    patch: sql<string>`CONCAT(${table.eu4Saves.saveVersionFirst}, '.', ${table.eu4Saves.saveVersionSecond}, '.', ${table.eu4Saves.saveVersionThird}, '.', ${table.eu4Saves.saveVersionFourth})`,
    difficulty: table.eu4Saves.gameDifficulty,
    achievements: table.eu4Saves.achieveIds,
    leaderboard_qualified: table.eu4Saves.leaderboardQualified,
    ...opts?.save,
  } as const;

  const userColumns = {
    user_id: table.users.userId,
    user_name: userView.userName,
  } as const;

  return {
    save: {
      ...saveColumns,
      ...opts?.save,
    } as typeof saveColumns & S,
    user: {
      ...userColumns,
      ...opts?.user,
    } as typeof userColumns & U,
  };
}

type DbRow = { upload_time: Date; difficulty: GameDifficulty };
export function toApiSave<T extends DbRow>({ upload_time, difficulty, ...save }: T) {
  return {
    ...save,
    upload_time: new Date(upload_time).toISOString(),
    game_difficulty: dbDifficulty(difficulty),
  };
}

function reverseRecord<T extends PropertyKey, U extends PropertyKey>(input: Record<T, U>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [value, key])) as Record<
    U,
    T
  >;
}

const difficultyTable = {
  VeryEasy: "very_easy",
  Easy: "easy",
  Normal: "normal",
  Hard: "hard",
  VeryHard: "very_hard",
} as const;

const dbDifficultyTable = reverseRecord(difficultyTable);

export const dbDifficulty = (dbDiff: GameDifficulty) => dbDifficultyTable[dbDiff];
export const toDbDifficulty = (diff: keyof typeof difficultyTable) => difficultyTable[diff];

export const apiKeyAtRest = async (key: string) => {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest({ name: "SHA-256" }, data);
  return Buffer.from(digest).toString("base64url");
};

export const fromParsedSave = (save: Partial<ParsedFile>): Partial<Save> => {
  const result: Partial<Save> = {
    date: save.date,
    days: save.days,
    playerTag: save.player_tag,
    playerTagName: save.player_tag_name,
    playerStartTag: save.player_start_tag,
    playerStartTagName: save.player_start_tag_name,
    players: save.player_names,
    playthroughId: save.playthrough_id,
    achieveIds: save.achievements == null ? [] : save.achievements,
    gameDifficulty: save.game_difficulty && toDbDifficulty(save.game_difficulty),
    saveVersionFirst: save.patch?.first,
    saveVersionSecond: save.patch?.second,
    saveVersionThird: save.patch?.third,
    saveVersionFourth: save.patch?.fourth,
    scoreDays: save.score_days,
    hash: save.hash,
  };

  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined));
};

export const table = {
  users,
  eu4Saves,
  eu5Saves,
};

export type UserSaves = Awaited<ReturnType<typeof getUser>>;
export async function getUser(db: DbConnection, userId: UserId) {
  // The three queries run at the same time, so the page waits about as long
  // as for one query.
  const [users, eu4Saves, eu5Saves] = await Promise.all([
    db
      .select({
        created_on: table.users.createdOn,
        user_id: table.users.userId,
        user_name: userView.userName,
      })
      .from(table.users)
      .where(eq(table.users.userId, userId)),
    db
      .select(
        saveView({
          save: {
            filename: table.eu4Saves.filename,
            playthrough_id: table.eu4Saves.playthroughId,
            days: table.eu4Saves.days,
            players: sql<number>`cardinality(${table.eu4Saves.players})`,
          },
        }).save,
      )
      .from(table.eu4Saves)
      .where(eq(table.eu4Saves.userId, userId))
      .orderBy(desc(table.eu4Saves.createdOn)),
    db
      .select({
        id: table.eu5Saves.id,
        upload_time: table.eu5Saves.createdOn,
        filename: table.eu5Saves.filename,
        date: table.eu5Saves.date,
        playthrough_id: table.eu5Saves.playthroughId,
        playthrough_name: table.eu5Saves.playthroughName,
        version_major: table.eu5Saves.versionMajor,
        version_minor: table.eu5Saves.versionMinor,
        version_patch: table.eu5Saves.versionPatch,
      })
      .from(table.eu5Saves)
      .where(eq(table.eu5Saves.userId, userId))
      .orderBy(desc(table.eu5Saves.createdOn)),
  ]);

  const user = users.at(0);
  if (user === undefined) {
    throw new NotFoundError("user");
  }

  return {
    user_info: {
      ...user,
      created_on: user.created_on.toISOString(),
    },
    saves: eu4Saves.map(toApiSave),
    eu5_saves: eu5Saves.map((save) => ({
      ...save,
      upload_time: save.upload_time.toISOString(),
    })),
  };
}

export async function getAchievementDb(db: DbConnection, achievement: Achievement) {
  // saves with achievement
  const saves = db
    .select({
      id: table.eu4Saves.id,
      rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY playthrough_id ORDER BY score_days)`.as("rn"),
    })
    .from(table.eu4Saves)
    .where(
      and(
        sql`${table.eu4Saves.achieveIds} @> Array[${[achievement.id]}]::int[]`,
        isNotNull(table.eu4Saves.scoreDays),
        eq(table.eu4Saves.leaderboardQualified, true),
      ),
    )
    .as("ranked");

  // best save in a given playthrough
  const top = db.select({ id: saves.id }).from(saves).where(eq(saves.rn, 1));

  const result = await db
    .select(
      saveView({
        save: {
          scoreDays: table.eu4Saves.scoreDays,
          days: table.eu4Saves.days,
          patch: sql<string>`CONCAT(${table.eu4Saves.saveVersionFirst}, '.', ${table.eu4Saves.saveVersionSecond})`,
        },
      }),
    )
    .from(table.eu4Saves)
    .innerJoin(table.users, eq(table.users.userId, table.eu4Saves.userId))
    .where(inArray(table.eu4Saves.id, top))
    .orderBy(asc(table.eu4Saves.scoreDays), asc(table.eu4Saves.createdOn));

  const leaderboard = result.map(({ save: { scoreDays, days, ...save }, user }) => ({
    ...user,
    ...toApiSave(save),
    days,
    weighted_score: {
      days: scoreDays as number,
      date: eu4DaysToDate(scoreDays as number),
    },
  }));

  const gold = leaderboard.at(0);
  const goldDate = gold ? eu4DaysToDate(gold.weighted_score.days) : undefined;

  return {
    goldDate,
    saves: leaderboard,
  };
}
