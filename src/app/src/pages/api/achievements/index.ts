import { NextApiRequest, NextApiResponse } from "next";
import { db, toApiSave } from "../../../server-lib/db";
import { achievementsWithTopSaves } from "../../../server-lib/leaderboard";
import { withCoreMiddleware } from "../../../server-lib/middlware";
import { ApiAchievementsResponse } from "../../../services/rakalyApi";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const achievements = await achievementsWithTopSaves();
  const saveIds = achievements
    .map((x) => x.top_save_id)
    .filter((x): x is string => x !== null);
  const usaves = new Set(saveIds);

  const raw = await db.save.findMany({
    where: {
      id: {
        in: Array.from(usaves),
      },
    },
    include: {
      user: true,
    },
  });

  const saves = raw.map((x) => toApiSave(x));

  const result: ApiAchievementsResponse = {
    achievements,
    saves,
  };

  res.json(result);
};

export default withCoreMiddleware(handler);
