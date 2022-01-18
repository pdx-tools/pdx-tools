import type { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { ParsedFile } from "@/server-lib/pool";
import { db } from "@/server-lib/db";
import { addToLeaderboard } from "@/server-lib/leaderboard";

type ReprocessEntry = {
  saveId: string;
  save: ParsedFile;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const saves: ReprocessEntry[] = req.body;

  for (let i = 0; i < saves.length; i++) {
    const save = saves[i];

    // TODO: avoid empty updates
    await db.save.update({
      where: { id: save.saveId },
      data: save.save,
    });

    const insertDate = await db.save.findUnique({
      where: { id: save.saveId },
      select: { createdOn: true },
    });

    if (insertDate === null) {
      throw new Error(`unable to find ${save.saveId}`);
    }

    await addToLeaderboard(
      save.saveId,
      save.save,
      +insertDate.createdOn / 1000
    );
  }

  res.status(200).setHeader("Content-Type", "text/plain").send("done");
};

export default withCoreMiddleware(handler);
