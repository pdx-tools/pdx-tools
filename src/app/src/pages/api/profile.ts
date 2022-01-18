import dayjs from "dayjs";
import { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/server-lib/db";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { extractSession } from "@/server-lib/session";
import { PrivateUserInfo, ProfileResponse } from "@/services/rakalyApi";

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

  let account: PrivateUserInfo["account"];
  switch (user.account) {
    case "ADMIN": {
      account = "admin";
    }
    case "FREE": {
      account = "free";
    }
  }

  const result: ProfileResponse = {
    kind: "user",
    user: {
      user_id: uid,
      steam_id: user.steamId ?? "unknown",
      user_name: user.display,
      account,
      created_on: dayjs(user.createdOn).toISOString(),
    },
  };

  res.json(result);
};

export default withCoreMiddleware(handler);
