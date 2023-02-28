import { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "../../server-lib/middlware";
import { db, toApiSave } from "../../server-lib/db";
import { SaveFile } from "@/services/appApi";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const pageSize = +(req.query?.pageSize ?? 0) || 50;
  const cursor = req.query?.cursor;
  let timestamp: Date | undefined = undefined;
  if (cursor && !Array.isArray(cursor)) {
    const row = await db.save.findUnique({
      where: {
        id: cursor,
      },
      select: {
        createdOn: true,
      },
    });
    timestamp = row?.createdOn;
  }

  const saves = await db.save.findMany({
    take: pageSize,
    where: {
      ...(timestamp !== undefined ? { createdOn: { lt: timestamp } } : {}),
    },
    include: { user: true },
    orderBy: { createdOn: "desc" },
  });

  const result: SaveFile[] = saves.map(toApiSave);
  const cursorRes = result.length < pageSize ? undefined : result.at(-1)?.id;
  res.json({ saves: result, cursor: cursorRes });
};

export default withCoreMiddleware(handler);
