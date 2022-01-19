import type { NextApiRequest, NextApiResponse } from "next";
import { SaveFile } from "@/services/appApi";
import { db, toApiSave } from "@/server-lib/db";
import { ValidationError } from "@/server-lib/errors";
import { getAchievement } from "@/server-lib/pool";
import { AchievementView } from "@/services/appApi";
import { withCoreMiddleware } from "@/server-lib/middlware";
import {
  countAchievementUploads,
  getAchievementLeaderboardSaveIds,
} from "@/server-lib/leaderboard";
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

  const saveIds = await getAchievementLeaderboardSaveIds(achieveId);
  const count = await countAchievementUploads(achieveId);
  const saves = await db.save.findMany({
    where: {
      id: {
        in: saveIds,
      },
    },
    include: {
      user: true,
    },
    orderBy: {
      days: "asc",
    },
  });

  const campaignIds = new Set();
  const playthroughIds = new Set();
  const outSaves: SaveFile[] = [];

  for (let i = 0; i < saves.length; i++) {
    const save = saves[i];
    if (
      campaignIds.has(save.campaignId) ||
      (save.playthroughId && playthroughIds.has(save.playthroughId))
    ) {
      continue;
    }

    campaignIds.add(save.campaignId);
    playthroughIds.add(save.playthroughId);
    outSaves.push(toApiSave(save));
  }

  const result: AchievementView = {
    achievement: {
      ...achievement,
      top_save_id: saveIds[0] || null,
      uploads: count,
    },
    saves: outSaves,
  };

  res.json(result);
};

export default withCoreMiddleware(handler);
