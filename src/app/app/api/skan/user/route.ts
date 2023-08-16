import { SessionRoute, withAuth } from "@/server-lib/auth/middleware";
import { DbRoute, table, withDb } from "@/server-lib/db";
import { getEnv } from "@/server-lib/env";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { SkanUserSaves } from "@/services/appApi";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

async function handler(
  _req: NextRequest,
  { session, dbConn }: SessionRoute & DbRoute,
) {
  const apiKey = getEnv("SKAN_API_KEY");
  const db = await dbConn;
  const query = await db
    .select({ steamId: table.users.steamId })
    .from(table.users)
    .where(eq(table.users.userId, session.uid));
  const steamId = query[0]?.steamId;
  if (!steamId) {
    return NextResponse.json(
      { msg: "user does not have associated steam account" },
      { status: 404 },
    );
  }

  const params = new URLSearchParams({
    key: apiKey,
    scope: "fetchUserSaves",
    steamid: steamId,
  });
  const url = `https://skanderbeg.pm/api.php?` + params;
  log.info({ skanderbeg: url });
  const skanResponse = await fetch(url);
  const skanJson = await skanResponse.json();

  // If skanderbeg returns a string then it means an error message
  // This is intended according to jarvin: "Outputting an actual error message seems to be a
  // less confusing approach than outputting an empty array"
  if (typeof skanJson === "string") {
    return NextResponse.json<SkanUserSaves[]>([]);
  } else {
    return NextResponse.json<SkanUserSaves[]>(skanJson);
  }
}

export const GET = withAuth(withCore(withDb(handler)));
