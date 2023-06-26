import { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { s3Presigned } from "@/server-lib/s3";
import { z } from "zod";

const saveSchema = z.object({ saveId: z.string() });
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const save = saveSchema.parse(req.query);
  const redir = await s3Presigned(save.saveId);
  res.redirect(307, redir);
};

export default withCoreMiddleware(handler);
