import { getAchievementDb } from "@/server-lib/db";
import { NotFoundError } from "@/server-lib/errors";
import { getAchievement } from "@/server-lib/game";
import { z } from "zod";

const paramSchema = z.object({ achievementId: z.coerce.number() });
export const fetchAchievement = async (params: { achievementId: string }) => {
  const achieveId = paramSchema.parse(params).achievementId;
  const achievement = getAchievement(achieveId);
  if (achievement === undefined) {
    throw new NotFoundError("achievement");
  }

  const data = await getAchievementDb(achievement);
  return {
    ...data,
    saves: data.saves.map((x, i) => ({ ...x, rank: i + 1 })),
  };
};

export type AchievementResponse = Awaited<ReturnType<typeof fetchAchievement>>;
