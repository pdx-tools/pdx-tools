import { DbConnection } from "@/server-lib/db/connection";
import { withDb } from "@/server-lib/db/middleware";
import { fetchAchievement, findAchievement } from "@/server-lib/fn/achievement";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/api.achievements.$achievementId";
import { z } from "zod";

export type AchievementApiResponse = Awaited<ReturnType<typeof getAchievement>>;
async function getAchievement(
  db: DbConnection,
  { achievementId }: { achievementId: string },
) {
  const achievement = findAchievement({ achievementId });
  const saves = await fetchAchievement(db, achievement);
  return { achievement, saves: saves.saves };
}

const paramsSchema = z.object({ achievementId: z.string() });
export const loader = withCore(
  withDb(async ({ params }: Route.LoaderArgs, { db }) => {
    return Response.json(await getAchievement(db, paramsSchema.parse(params)));
  }),
);
