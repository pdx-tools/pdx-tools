import { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "../../server-lib/middlware";
import { db, toApiSave } from "../../server-lib/db";
import { SaveFile } from "@/services/appApi";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const saves = await db.save.findMany({
    take: 50,
    include: { user: true },
    orderBy: { createdOn: "desc" },
  });

  const result: SaveFile[] = saves.map(toApiSave);
  res.json({ saves: result });
};

export default withCoreMiddleware(handler);
