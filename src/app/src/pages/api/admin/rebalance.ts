import { withCoreMiddleware } from "@/server-lib/middlware";
import { latestEu4MinorPatch } from "@/server-lib/pool";
import { db, table } from "@/server-lib/db";
import { sql } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const patch =
    req.query?.__patch_override_for_testing ?? latestEu4MinorPatch();

  await db
    .update(table.saves)
    .set({
      scoreDays: sql`days * (10 + (${+patch} - LEAST(save_version_second, ${+patch}))) / 10`,
    })
    .where(sql`cardinality(${table.saves.achieveIds}) != 0`);

  res.status(200).setHeader("Content-Type", "text/plain").send("done");
};

export default withCoreMiddleware(handler);
