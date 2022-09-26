import type { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { ParsedFile } from "@/server-lib/pool";
import { db, fromApiSave } from "@/server-lib/db";

type ReprocessEntry = {
  saveId: string;
  save: Partial<ParsedFile>;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const saves: ReprocessEntry[] = req.body;

  for (let i = 0; i < saves.length; i++) {
    const save = saves[i];

    await db.save.update({
      where: { id: save.saveId },
      data: fromApiSave(save.save),
    });
  }

  res.status(200).setHeader("Content-Type", "text/plain").send("done");
};

export default withCoreMiddleware(handler);
