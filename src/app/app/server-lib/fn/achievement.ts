import { getAchievementDb, table, userView } from "@/server-lib/db";
import { NotFoundError } from "@/server-lib/errors";
import { getAchievement, loadAchievements } from "@/server-lib/game";
import { toEu4Save } from "@/server-lib/fn/feed";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbConnection } from "../db/connection";

export async function fetchAchievement(
  db: DbConnection,
  achievement: ReturnType<typeof findAchievement>,
  limit?: number,
) {
  const data = await getAchievementDb(db, achievement, limit);
  return {
    ...data,
    saves: data.saves.map((x, i) => ({ ...x, rank: i + 1 })),
  };
}

const paramSchema = z.object({ achievementId: z.coerce.number() });
export function findAchievement(params: { achievementId: string }) {
  const achieveId = paramSchema.parse(params).achievementId;
  const achievement = getAchievement(achieveId);
  if (achievement === undefined) {
    throw new NotFoundError("achievement");
  }
  return achievement;
}

/** A top-three place on one achievement leaderboard. */
export type Medal = { id: number; name: string; rank: 1 | 2 | 3 };

/** The `medals` column of the podium query, a JSON array. */
const PodiumMedals = z.array(
  z.object({ id: z.number().int(), rank: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
);

/**
 * The newest uploads that hold a top-three place on an achievement
 * leaderboard now, each with every medal it holds. A board with fewer than
 * three entries counts too: its free places are an opening for the next
 * run. Set `minPlaces` to show only boards with at least that many places
 * filled. Ranks are live: a rebalance or a faster run can take a medal
 * away, and the save then drops out of this list.
 *
 * One statement, so one round trip. Each leaderboard is a three-row index
 * scan of `eu4_achievement_bests`, so the cost does not grow with the
 * number of saves.
 */
export async function getPodiumFinishes(
  db: DbConnection,
  limit: number,
  minPlaces: Medal["rank"] = 1,
) {
  const achievements = loadAchievements();
  // One array literal, bound as one parameter. Drizzle would spread a JS
  // array into a row of parameters, which cannot be cast to int[].
  const ids = `{${achievements.map((x) => x.id).join(",")}}`;

  const podium = sql`(
    SELECT top.save_id, max(top.created_on) AS latest,
      json_agg(json_build_object('id', board.achieve_id, 'rank', top.rank)
        ORDER BY top.rank, board.achieve_id) AS medals
    FROM unnest(${ids}::int[]) AS board(achieve_id)
    CROSS JOIN LATERAL (
      SELECT b.save_id, b.created_on,
        row_number() OVER (ORDER BY b.score_days, b.created_on, b.save_id) AS rank,
        count(*) OVER () AS places
      FROM (
        SELECT * FROM ${table.eu4AchievementBests} b
        WHERE b.achieve_id = board.achieve_id
        ORDER BY b.score_days, b.created_on, b.save_id
        LIMIT 3
      ) b
    ) top
    WHERE top.places >= ${minPlaces}
    GROUP BY top.save_id
    ORDER BY latest DESC
    LIMIT ${limit}
  ) AS podium`;

  const rows = await db
    .select({
      save: table.eu4Saves,
      userName: userView.userName,
      medals: sql<unknown>`podium.medals`,
    })
    .from(table.eu4Saves)
    .innerJoin(podium, sql`podium.save_id = ${table.eu4Saves.id}`)
    .innerJoin(table.users, eq(table.users.userId, table.eu4Saves.userId))
    .orderBy(sql`podium.latest DESC`);

  const names = new Map(achievements.map((x) => [x.id, x.name]));
  return rows.map((row) => ({
    save: toEu4Save(row.save, row.userName),
    medals: PodiumMedals.parse(row.medals).map((medal): Medal => ({
      ...medal,
      name: names.get(medal.id) ?? `Achievement ${medal.id}`,
    })),
  }));
}

export type PodiumFinish = Awaited<ReturnType<typeof getPodiumFinishes>>[number];

/**
 * The podium of the leaderboard that changed last: the newest run to take
 * a top-three place, shown on the board where it placed highest. Only full
 * podiums count, so all three places are filled. With no full podium yet,
 * the result is null.
 */
export async function getLatestPodium(db: DbConnection) {
  const [finish] = await getPodiumFinishes(db, 1, 3);
  const medal = finish?.medals.at(0);
  const achievement = medal && getAchievement(medal.id);
  if (!finish || !medal || !achievement) {
    return null;
  }

  const { saves } = await fetchAchievement(db, achievement, 3);
  return {
    achievement: { id: achievement.id, name: achievement.name },
    saves,
    newSaveId: finish.save.id,
  };
}

export type LatestPodium = NonNullable<Awaited<ReturnType<typeof getLatestPodium>>>;
