import dayjs from "dayjs";
import { NextApiRequest, NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { getString } from "@/server-lib/valiation";
import { SaveFile, UserSaves } from "@/services/appApi";
import { db, table, toApiSaveUser } from "@/server-lib/db";
import { eq, desc } from "drizzle-orm";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const userId = getString(req.query, "userId");
  const usersSaves = await db
    .select()
    .from(table.saves)
    .rightJoin(table.users, eq(table.users.userId, table.saves.userId))
    .where(eq(table.users.userId, userId))
    .orderBy(desc(table.saves.createdOn));

  const user = usersSaves[0]?.users;
  if (!user) {
    res.status(405).json(JSON.stringify({ msg: "user does not exist" }));
    return;
  }

  const saves = usersSaves.reduce<SaveFile[]>((acc, row) => {
    if (row.saves !== null) {
      acc.push(toApiSaveUser(row.saves, user));
    }

    return acc;
  }, []);

  const result: UserSaves = {
    user_info: {
      created_on: dayjs(user.createdOn).toISOString(),
      user_id: user.userId,
      user_name: user.display || user.steamName || "unknown",
    },
    saves,
  };

  res.json(result);
};

export default withCoreMiddleware(handler);
