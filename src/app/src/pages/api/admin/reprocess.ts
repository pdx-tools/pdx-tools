import type { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { calcWeightedScore, ParsedFile } from "@/server-lib/pool";
import { db, fromApiSave } from "@/server-lib/db";
import {
  addToLeaderboard,
  removeFromLeaderboard,
} from "@/server-lib/leaderboard";
import { log } from "@/server-lib/logging";

type ReprocessEntry = {
  saveId: string;
  save: Partial<ParsedFile>;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const saves: ReprocessEntry[] = req.body;

  for (let i = 0; i < saves.length; i++) {
    const save = saves[i];

    const saveRow = await db.save.update({
      where: { id: save.saveId },
      data: fromApiSave(save.save),
    });

    const patch_shorthand = `${saveRow.saveVersionFirst}.${saveRow.saveVersionSecond}`;
    const weighted_score = calcWeightedScore(
      saveRow.saveVersionFirst,
      saveRow.saveVersionSecond,
      saveRow.days
    );

    if (save.save.achievements || save.save.weighted_score !== undefined) {
      log.info({
        msg: `save (${saveRow.id}) achievements (${save.save.achievements}) updated score (${weighted_score.days})`,
      });
      const leaderboardData = {
        achievements: saveRow.achieveIds,
        days: saveRow.days,
        patch_shorthand: patch_shorthand,
        weighted_score: weighted_score.days,
      };

      await removeFromLeaderboard(saveRow);

      await addToLeaderboard(
        save.saveId,
        leaderboardData,
        +saveRow.createdOn / 1000
      );
    }
  }

  res.status(200).setHeader("Content-Type", "text/plain").send("done");
};

export default withCoreMiddleware(handler);
