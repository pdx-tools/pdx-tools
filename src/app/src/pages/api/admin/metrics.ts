import type { NextApiRequest, NextApiResponse } from "next";
import { metrics } from "@/server-lib/metrics";
import { withCoreMiddleware } from "@/server-lib/middlware";

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  const out = await metrics.register.metrics();
  res.status(200).setHeader("Content-Type", "text/plain").send(out);
};

export default withCoreMiddleware(handler);
