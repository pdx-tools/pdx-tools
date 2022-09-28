import { db } from "@/server-lib/db";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { latestEu4MinorPatch } from "@/server-lib/pool";
import { NextApiRequest, NextApiResponse } from "next";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const patch =
    req.query?.__patch_override_for_testing ?? latestEu4MinorPatch();

  await db.$executeRaw`
    UPDATE saves SET score_days = days * (10 + (${+patch} - LEAST(save_version_second, ${+patch}))) / 10
    WHERE cardinality(achieve_ids) != 0
  `;

  res.status(200).setHeader("Content-Type", "text/plain").send("done");
};

export default withCoreMiddleware(handler);
