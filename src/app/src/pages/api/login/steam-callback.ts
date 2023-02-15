import { NextApiRequest, NextApiResponse } from "next";
import { nanoid } from "nanoid";
import { db } from "@/server-lib/db";
import { getEnv } from "@/server-lib/env";
import { ValidationError } from "@/server-lib/errors";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { NextSessionRequest, withHttpSession } from "@/server-lib/session";
import { STEAM_URL } from "./steam";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const steamUid = await loginVerify(req.query);
  const steamName = await getPlayerName(steamUid);
  const user = await db.user.findUnique({ where: { steamId: steamUid } });

  let userId;
  if (user === null) {
    // An id that is a tad longer than 64 bits in length so that the hash collision is
    // still manageable.
    userId = nanoid(12);
    await db.user.create({
      data: {
        userId,
        steamId: steamUid,
        steamName: steamName,
      },
    });
  } else {
    userId = user.userId;
  }

  req.session.user = { uid: userId };
  await req.session.save();

  res.redirect("/");
};

async function loginVerify(data: NextSessionRequest["query"]) {
  data["openid.mode"] = "check_authentication";
  const claimId = data["openid.claimed_id"];
  if (claimId === undefined) {
    throw new Error("openid.claimed_id");
  }

  const url = new URL(getSingleInstance(claimId));
  const uid = url.pathname.substring(url.pathname.lastIndexOf("/") + 1);

  const reqParams: string[][] = [];
  for (let key in data) {
    const val = data[key];
    if (typeof val === "string") {
      reqParams.push([key, val]);
    } else if (val !== undefined) {
      reqParams.push([key, ...val]);
    }
  }

  const reqbody = new URLSearchParams(reqParams);
  const request = fetch(STEAM_URL, {
    method: "POST",
    body: reqbody,
  });

  const response = await request;
  const body = await response.text();

  if (body.indexOf("is_valid:true") === -1) {
    throw new ValidationError(`steam unable to validate request: ${body}`);
  } else {
    return uid;
  }
}

async function getPlayerName(steamUid: string) {
  const apiKey = getEnv("STEAM_API_KEY");
  const params = new URLSearchParams([
    ["key", apiKey],
    ["steamids", steamUid],
  ]);
  const request = fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002?${params}`
  );

  const response = await request;
  const body = await response.json();
  const name = body?.response?.players?.[0]?.personaname;
  if (typeof name !== "string") {
    throw new ValidationError("could not retrieve player name from steam");
  } else {
    return name;
  }
}

function getSingleInstance(data: string | string[]): string {
  if (Array.isArray(data)) {
    throw new ValidationError("expected single instance");
  } else {
    return data;
  }
}

export default withCoreMiddleware(withHttpSession(handler));
