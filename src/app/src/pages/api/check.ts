import { CheckRequest, CheckResponse } from "@/services/rakalyApi";
import { NextApiResponse } from "next";
import { db, toApiSave } from "../../server-lib/db";
import { leaderboardEligible } from "../../server-lib/leaderboard";
import { withCoreMiddleware } from "../../server-lib/middlware";
import * as pool from "../../server-lib/pool";
import { remainingSaveSlots } from "../../server-lib/redis";
import { NextSessionRequest, withSession } from "../../server-lib/session";
import {
  getArray,
  getNumber,
  getString,
  narrowNumber,
} from "../../server-lib/valiation";

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

  const uid = req.sessionUid;
  const body = parseCheck(req.body);
  const remainingSlots = await remainingSaveSlots(uid);
  const validPatch = pool.validPatch(body.patch.first, body.patch.second);
  if (!validPatch) {
    const response: CheckResponse = {
      saves: [],
      valid_patch: false,
      qualifying_record: false,
      remaining_save_slots: remainingSlots,
    };
    res.json(response);
    return;
  }

  const existingSaves = await db.save.findMany({
    where: {
      hash: body.hash,
    },
    include: {
      user: true,
    },
  });

  const saves = await Promise.all(existingSaves.map(toApiSave));
  const response: CheckResponse = {
    saves,
    valid_patch: validPatch,
    qualifying_record: false,
    remaining_save_slots: remainingSlots,
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

  const qualifyingRecord = await leaderboardEligible({
    days: body.score,
    achievements: body.achievement_ids,
    campaignId: body.campaign_id,
    playthroughId: body.playthrough_id,
  });

  res.json({
    ...response,
    qualifying_record: qualifyingRecord,
  });
};

export default withCoreMiddleware(withSession(handler));
