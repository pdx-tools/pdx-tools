import { withCoreMiddleware } from "@/server-lib/middlware";
import { weightedFactor } from "@/server-lib/pool";
import { redisClient } from "@/server-lib/redis";
import { NextApiRequest, NextApiResponse } from "next";

interface AchievementWeight {
  setId: string;
  factor: number;
}

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  const redis = await redisClient();
  const achieveWeights: Map<string, AchievementWeight[]> = new Map();

  for await (const key of redis.scanIterator({
    MATCH: "raw_achievement_scores*",
  })) {
    const [_, achievementId, patch] = key.split(":");
    const [major, minor] = patch.split(".");
    const factor = weightedFactor(+major, +minor);
    if (factor === null) {
      throw new Error(`unable to calculate factor of ${patch}`);
    }

    const val = achieveWeights.get(achievementId) ?? [];
    achieveWeights.set(achievementId, [
      ...val,
      {
        setId: key,
        factor,
      },
    ]);
  }

  for (const [achievementId, patches] of achieveWeights) {
    let dest = `achievement_scores:${achievementId}`;
    let keys = patches.map((x) => x.setId);
    let weights = patches.map((x) => x.factor);

    await redis.zUnionStore(dest, keys, {
      WEIGHTS: weights,
    });
  }

  res.status(200).setHeader("Content-Type", "text/plain").send("done");
};

export default withCoreMiddleware(handler);
