import type { NextApiRequest, NextApiResponse } from "next";
import { ValidationError } from "@/server-lib/errors";
import { getAchievement } from "@/server-lib/pool";
import { AchievementView } from "@/services/appApi";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { getNumber } from "@/server-lib/valiation";
import { db, table, toApiSave } from "@/server-lib/db";
import { sql, eq, asc, inArray } from "drizzle-orm";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const achieveId = getNumber(req.query, "achievementId");
  const achievement = getAchievement(achieveId);
  if (achievement === undefined) {
    throw new ValidationError("achievement not found");
  }

  const saves = await db
    .select({
      id: table.saves.id,
      campaignId: table.saves.campaignId,
      playthroughId: table.saves.playthroughId,
      rank: sql<number>`RANK() OVER(
        ORDER BY score_days, created_on ASC
      )`,
    })
    .from(table.saves)
    .where(sql`${table.saves.achieveIds} @> Array[${[achieveId]}]::int[]`);

  const campaignIds = new Set();
  const playthroughIds = new Set();
  const outSaves: string[] = [];

  for (const save of saves) {
    if (
      campaignIds.has(save.campaignId) ||
      (save.playthroughId && playthroughIds.has(save.playthroughId))
    ) {
      continue;
    }

    campaignIds.add(save.campaignId);
    playthroughIds.add(save.playthroughId);
    outSaves.push(save.id);
  }

  const result =
    outSaves.length > 0
      ? await db
          .select()
          .from(table.saves)
          .innerJoin(table.users, eq(table.users.userId, table.saves.userId))
          .where(inArray(table.saves.id, outSaves))
          .orderBy(asc(table.saves.scoreDays))
      : [];

  const out: AchievementView = {
    achievement: {
      ...achievement,
    },
    saves: result.map((x) => toApiSave(x)),
  };

  res.json(out);
};

export default withCoreMiddleware(handler);
