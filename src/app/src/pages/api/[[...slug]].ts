import { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  res.status(404).json({ msg: "not found" });
};

export default withCoreMiddleware(handler);
