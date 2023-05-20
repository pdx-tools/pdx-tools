import { CheckRequest, CheckResponse } from "@/services/appApi";
import { NextApiResponse } from "next";
import { withCoreMiddleware } from "@/server-lib/middlware";
import * as pool from "@/server-lib/pool";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import {
  getArray,
  getNumber,
  getString,
  narrowNumber,
} from "@/server-lib/valiation";
import { db, table, toApiSave } from "@/server-lib/db";
import { eq } from "drizzle-orm";

const parseCheck = (data: any): CheckRequest => {
  return {
    hash: getString(data, "hash"),
    campaign_id: getString(data, "campaign_id"),
    playthrough_id: getString(data, "playthrough_id"),
    patch: {
      first: getNumber(data, "patch.first"),
      second: getNumber(data, "patch.second"),
      third: getNumber(data, "patch.third"),
      fourth: getNumber(data, "patch.fourth"),
    },
    score: getNumber(data, "score"),
    achievement_ids: getArray(data, "achievement_ids", narrowNumber),
  };
};

const handler = async (req: NextSessionRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const body = parseCheck(req.body);
  const validPatch = pool.validPatch(body.patch.first, body.patch.second);
  if (!validPatch) {
    const response: CheckResponse = {
      saves: [],
      valid_patch: false,
    };
    res.json(response);
    return;
  }

  const existingSaves = await db
    .select()
    .from(table.saves)
    .innerJoin(table.users, eq(table.users.userId, table.saves.userId))
    .where(eq(table.saves.hash, body.hash));

  const saves = existingSaves.map(toApiSave);
  const response: CheckResponse = {
    saves,
    valid_patch: validPatch,
  };

  if (saves.length > 0) {
    res.json(response);
    return;
  }

  const unknown = body.achievement_ids.filter(
    (x) => pool.getAchievement(x) === undefined
  );
  if (unknown.length > 0) {
    res.json(response);
    return;
  }

  res.json(response);
};

export default withCoreMiddleware(withSession(handler));
