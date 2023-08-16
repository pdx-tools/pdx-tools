import { getEnv, isLocal } from "@/server-lib/env";
import { eq } from "drizzle-orm";
import { table, withDb } from "@/server-lib/db";
import { NextResponse } from "next/server";
import { newSessionCookie } from "@/server-lib/auth/session";
import { withCore } from "@/server-lib/middleware";

export const runtime = isLocal() ? "nodejs" : "edge";

const TEST_UID = "100";
export const STEAM_URL = "https://steamcommunity.com/openid/login";

const handler = !isLocal()
  ? () => {
      const externalAddress = getEnv("EXTERNAL_ADDRESS");
      const url = loginRedirectUrl(
        externalAddress,
        "/api/login/steam-callback",
      );
      return NextResponse.redirect(url, 302);
    }
  : withCore(
      withDb(async (req: Request, { dbConn }) => {
        const db = await dbConn;
        const users = await db
          .select()
          .from(table.users)
          .where(eq(table.users.userId, TEST_UID));
        const user = users[0];

        if (!user) {
          await db.insert(table.users).values({
            userId: TEST_UID,
            steamId: "1000",
            steamName: "my-steam-name",
          });
        }

        const cookie = await newSessionCookie({
          userId: TEST_UID,
          steamId: "1000",
          account: "free",
        });
        const dest = new URL("/", req.url);
        const response = NextResponse.redirect(dest, 302);
        response.cookies.set(cookie);
        return response;
      }),
    );

export const GET = handler;
export const POST = isLocal() ? handler : undefined;

function loginRedirectUrl(external_address: string, callback: string) {
  const params = {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.sreg": "http://openid.net/extensions/sreg/1.1",
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.mode": "checkid_setup",
    "openid.realm": external_address,
    "openid.return_to": `${external_address}${callback}`,
  };

  const steamUrl = new URL(STEAM_URL);
  steamUrl.search = new URLSearchParams(params).toString();
  return steamUrl;
}
