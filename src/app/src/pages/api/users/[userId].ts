import dayjs from "dayjs";
import { NextApiRequest, NextApiResponse } from "next";
import { db, toApiSaveUser } from "../../../server-lib/db";
import { withCoreMiddleware } from "../../../server-lib/middlware";
import { getString } from "../../../server-lib/valiation";
import { UserSaves } from "../../../services/rakalyApi";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const userId = getString(req.query, "userId");
  const userSaves = await db.user.findUnique({
    where: {
      userId,
    },
    include: {
      saves: {
        orderBy: {
          createdOn: "desc",
        },
      },
    },
  });

  if (userSaves === null) {
    res.status(405).json(JSON.stringify({ msg: "user does not exist" }));
    return;
  }

  const result: UserSaves = {
    user_info: {
      created_on: dayjs(userSaves.createdOn).toISOString(),
      user_id: userSaves.userId,
      user_name: userSaves.display || userSaves.steamName || "unknown",
    },
    saves: userSaves.saves.map((x) => toApiSaveUser(x, userSaves)),
  };

  res.json(result);
};

export default withCoreMiddleware(handler);
