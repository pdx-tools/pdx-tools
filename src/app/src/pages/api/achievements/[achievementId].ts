import type { NextApiRequest, NextApiResponse } from "next";
import { SaveFile } from "@/services/appApi";
import { db, toApiSave } from "@/server-lib/db";
import { ValidationError } from "@/server-lib/errors";
import { getAchievement } from "@/server-lib/pool";
import { AchievementView } from "@/services/appApi";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { getNumber } from "@/server-lib/valiation";

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

  type LeaderboardSave = {
    id: string;
    campaign_id: string;
    playthrough_id: string;
  };
  const achievementNeedle = `{${achieveId}}`;
  const saves = await db.$queryRaw<LeaderboardSave[]>`
    SELECT saves.id, saves.campaign_id, saves.playthrough_id, RANK() OVER(
        ORDER BY score_days, created_on ASC
      ) rank
    FROM saves
    WHERE achieve_ids @> ${achievementNeedle}::int[]
  `;

  const campaignIds = new Set();
  const playthroughIds = new Set();
  const outSaves: string[] = [];

  for (let i = 0; i < saves.length; i++) {
    const save = saves[i];
    if (
      campaignIds.has(save.campaign_id) ||
      (save.playthrough_id && playthroughIds.has(save.playthrough_id))
    ) {
      continue;
    }

    campaignIds.add(save.campaign_id);
    playthroughIds.add(save.playthrough_id);
    outSaves.push(save.id);
  }

  const result = await db.save.findMany({
    where: {
      id: {
        in: outSaves,
      },
    },
    include: {
      user: true,
    },
    orderBy: {
      score_days: "asc",
    },
  });

  const out: AchievementView = {
    achievement: {
      ...achievement,
    },
    saves: result.map((x) => toApiSave(x)),
  };

  res.json(out);
};

export default withCoreMiddleware(handler);
