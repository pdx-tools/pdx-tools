import { table } from "@/server-lib/db";
import { sql } from "drizzle-orm";
import { genId } from "@/server-lib/id";
import { check } from "@/lib/isPresent";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import type { AppLoadContext, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { withDb } from "@/server-lib/db/middleware";
import { pdxSession } from "@/server-lib/auth/session";
import { pdxSteam } from "@/server-lib/steam.server";
import { userId } from "@/lib/auth";

export const loader = withCore(
  withDb(async ({ request, context }: LoaderFunctionArgs, { db }) => {
    const searchParams = new URL(request.url).searchParams;

    const { steamUid, steamName, genUserId } = import.meta.env.PROD
      ? await steamInfo(context, searchParams)
      : testInfo();

    const users = await db
      .insert(table.users)
      .values({
        userId: genUserId,
        steamId: steamUid,
        steamName: steamName,
        account: import.meta.env.PROD ? "free" : "admin",
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

    const dest = new URL("/", request.url);

    const sessionStorage = pdxSession({ context, request });
    const session = await sessionStorage.new();
    session.set("userId", user.userId);
    session.set("steamId", steamUid);
    session.set("account", user.account);
    const cookie = await sessionStorage.commit(session);

    // https://stackoverflow.com/q/42216700/433785
    return new Response(
      `<html>
      <head>
      <meta http-equiv="refresh" content="0;URL='${dest}'"/>
      </head>
      <body><p>Moved to <a href="${dest}">${dest}</a>.</p></body>
      <style>html {
        background-color: rgb(15 23 42);
        color: white;
      }</style>
      </html>
      `,
      {
        headers: {
          "Content-Type": "text/html",
          "Set-Cookie": cookie,
        },
      },
    );
  }),
);

async function steamInfo(
  context: AppLoadContext,
  searchParams: URLSearchParams,
) {
  const steam = pdxSteam({ context });
  const steamUid = await steam.loginVerify(searchParams);
  const steamName = await steam.getPlayerName(steamUid);
  const genUserId = userId(genId(12));
  return { steamUid, steamName, genUserId };
}

function testInfo() {
  return {
    steamUid: "1000",
    steamName: "my-steam-name",
    genUserId: userId("100"),
  };
}
