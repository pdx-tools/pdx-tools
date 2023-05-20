import { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { db, table, toApiSave } from "@/server-lib/db";
import { eq, lt, desc } from "drizzle-orm";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const pageSize = +(req.query?.pageSize ?? 0) || 50;
  const cursor = req.query?.cursor;
  let timestamp: Date | undefined = undefined;
  if (cursor && !Array.isArray(cursor)) {
    const row = await db
      .select({ createdOn: table.saves.createdOn })
      .from(table.saves)
      .where(eq(table.saves.id, cursor));
    timestamp = row[0]?.createdOn;
  }

  let query = db
    .select()
    .from(table.saves)
    .innerJoin(table.users, eq(table.users.userId, table.saves.userId));

  if (timestamp !== undefined) {
    query = query.where(lt(table.saves.createdOn, timestamp));
  }

  const saves = await query
    .orderBy(desc(table.saves.createdOn))
    .limit(pageSize);
  const result = saves.map(toApiSave);
  const cursorRes = result.length < pageSize ? undefined : result.at(-1)?.id;
  res.json({ saves: result, cursor: cursorRes });
};

export default withCoreMiddleware(handler);
