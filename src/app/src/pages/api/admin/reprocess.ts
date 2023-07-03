import type { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { fromParsedSave } from "@/server-lib/db";
import { db, table } from "@/server-lib/db";
import { eq } from "drizzle-orm";
import { ParsedFile } from "@/server-lib/save-parser";
import { log } from "@/server-lib/logging";

type ReprocessEntry = {
  saveId: string;
  save: Partial<ParsedFile>;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const saves: ReprocessEntry[] = req.body;

  for (const save of saves) {
    const update = fromParsedSave(save.save);
    log.info({ saveId: save.saveId, msg: "updating to", update });
    await db
      .update(table.saves)
      .set(update)
      .where(eq(table.saves.id, save.saveId));
  }

  res.status(200).setHeader("Content-Type", "text/plain").send("done");
};

export default withCoreMiddleware(handler);
