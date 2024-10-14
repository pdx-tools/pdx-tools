import { useAppSession } from '@/server-lib/auth/session';
import { createAPIFileRoute } from '@tanstack/start/api'
import { dbPool, DbRoute, table, withDb } from "@/server-lib/db";
import { getEnv } from "@/server-lib/env";
import { ValidationError } from "@/server-lib/errors";
import { sql } from "drizzle-orm";
import { fetchOk, fetchOkJson } from "@/lib/fetch";
import { genId } from "@/server-lib/id";
import { check } from "@/lib/isPresent";
import { STEAM_URL } from "@/lib/steam";
import { log } from "@/server-lib/logging";
import { withCore } from '@/server-lib/middleware';

export const Route = createAPIFileRoute('/api/login/steam-callback')({
  GET: withCore(async ({ request }) => {
    const searchParams = new URL(request.url).searchParams

     const { steamUid, steamName, genUserId } =
      process.env.NODE_ENV === "production"
        ? await steamInfo(searchParams)
        : testInfo();

    const db = dbPool().orm;
    const users = await db
      .insert(table.users)
      .values({
        userId: genUserId,
        steamId: steamUid,
        steamName: steamName,
        account: process.env.NODE_ENV === "production" ? "free" : "admin",
      })
      .onConflictDoUpdate({
        target: table.users.steamId,
        set: { steamName: sql.raw(`excluded.${table.users.steamName.name}`) },
      })
      .returning({
        userId: table.users.userId,
        account: table.users.account,
        inserted: sql<boolean>`(xmax = 0)`,
      });

    const user = check(users.at(0), "expected user");
    log.event({
      userId: user.userId,
      event: user.inserted ? "User created" : "User updated",
    });

    const prodDest =
      process.env.NEXT_PUBLIC_EXTERNAL_ADDRESS ?? "https://pdx.tools";
    const dest =
      process.env.NODE_ENV === "production" ? prodDest : new URL("/", request.url);

    const session = await useAppSession();
    await session.update({
      userId: user.userId,
      steamId: steamUid,
      account: user.account,
    })

    return new Response(null, {
      status: 302,
      headers: {
        location: `${dest}`
      }
    });
  })
})

async function steamInfo(searchParams: URLSearchParams) {
  const steamUid = await loginVerify(searchParams);
  const steamName = await getPlayerName(steamUid);
  const genUserId = genId(12);
  return { steamUid, steamName, genUserId };
}

function testInfo() {
  return { steamUid: "1000", steamName: "my-steam-name", genUserId: "100" };
}

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
