import { newSessionCookie } from "@/server-lib/auth/session";
import { DbRoute, table, withDb } from "@/server-lib/db";
import { getEnv } from "@/server-lib/env";
import { ValidationError } from "@/server-lib/errors";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { STEAM_URL } from "../steam/route";
import { fetchOk, fetchOkJson } from "@/lib/fetch";
import { genId } from "@/server-lib/id";
import { withCore } from "@/server-lib/middleware";

const handler = async (
  _req: NextRequest,
  { dbConn, searchParams }: DbRoute & { searchParams: URLSearchParams },
) => {
  const steamUid = await loginVerify(searchParams);
  const steamName = await getPlayerName(steamUid);

  const db = await dbConn;
  const users = await db
    .select({ userId: table.users.userId })
    .from(table.users)
    .where(eq(table.users.steamId, steamUid));
  const user = users[0];

  const userId = user?.userId ?? genId(12);
  if (!user) {
    await db.insert(table.users).values({
      userId,
      steamId: steamUid,
      steamName: steamName,
    });
  }

  const cookie = await newSessionCookie({
    userId,
    steamId: steamUid,
    account: "free",
  });

  const dest = new URL(getEnv("EXTERNAL_ADDRESS"));
  const response = NextResponse.redirect(dest, 302);
  response.cookies.set(cookie);
  return response;
};

export const GET = (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  return withCore(withDb(handler))(req, { searchParams });
};

async function loginVerify(data: URLSearchParams) {
  data.set("openid.mode", "check_authentication");
  const claimId = data.get("openid.claimed_id");
  if (!claimId) {
    throw new Error("openid.claimed_id");
  }

  const url = new URL(getSingleInstance(claimId));
  const uid = url.pathname.substring(url.pathname.lastIndexOf("/") + 1);

  const response = await fetchOk(STEAM_URL, {
    method: "POST",
    body: data,
  });

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
  const body = await fetchOkJson(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002?${params}`,
  );
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
