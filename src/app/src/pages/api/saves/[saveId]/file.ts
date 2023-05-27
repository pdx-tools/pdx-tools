import { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { s3Presigned } from "@/server-lib/s3";
import { getString } from "@/server-lib/valiation";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const saveId = getString(req.query, "saveId");
  const redir = await s3Presigned(saveId);
  res.redirect(307, redir);
};

export default withCoreMiddleware(handler);
