import dayjs from "dayjs";
import { NextApiRequest, NextApiResponse } from "next";
import { db, User } from "@/server-lib/db";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { extractSession } from "@/server-lib/session";
import { PrivateUserInfo, ProfileResponse } from "@/services/appApi";

function getAccount(user: User): PrivateUserInfo["account"] {
  switch (user.account) {
    case "ADMIN":
      return "admin";
    case "FREE":
      return "free";
  }
}

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

  const user = await db.user.findUnique({ where: { userId: uid } });
  if (user === null) {
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
      account: getAccount(user),
      created_on: dayjs(user.createdOn).toISOString(),
    },
  };

  res.json(result);
};

export default withCoreMiddleware(handler);
