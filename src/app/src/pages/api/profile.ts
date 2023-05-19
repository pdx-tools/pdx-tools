import dayjs from "dayjs";
import { NextApiRequest, NextApiResponse } from "next";
import { eq } from "drizzle-orm";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { extractSession } from "@/server-lib/session";
import { ProfileResponse } from "@/services/appApi";
import { db, table } from "@/server-lib/db";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const session = await extractSession(req, res);
  const uid = session.user?.uid;
  const guest: ProfileResponse = { kind: "guest" };
  if (uid === undefined) {
    res.json(guest);
    return;
  }

  const users = await db
    .select()
    .from(table.users)
    .where(eq(table.users.userId, uid));
  const user = users[0];
  if (!user) {
    session.destroy();
    res.json(guest);
    return;
  }

  const result: ProfileResponse = {
    kind: "user",
    user: {
      user_id: uid,
      steam_id: user.steamId ?? "unknown",
      user_name: user.display,
      account: user.account,
      created_on: dayjs(user.createdOn).toISOString(),
    },
  };

  res.json(result);
};

export default withCoreMiddleware(handler);
