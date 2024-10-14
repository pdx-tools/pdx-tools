import { getAchievementDb } from "@/server-lib/db";
import { NotFoundError } from "@/server-lib/errors";
import { getAchievement } from "@/server-lib/game";
import { z } from "zod";
import { DbConnection } from "../db/connection";

export async function fetchAchievement(
  db: DbConnection,
  achievement: ReturnType<typeof findAchievement>,
) {
  const data = await getAchievementDb(db, achievement);
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
