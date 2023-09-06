import { SessionRoute, withAuth } from "@/server-lib/auth/middleware";
import { DbRoute, apiKeyAtRest, table, withDb } from "@/server-lib/db";
import { NewKeyResponse } from "@/services/appApi";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

async function handler(
  _req: NextRequest,
  { session, dbConn }: SessionRoute & DbRoute,
) {
  // https://news.ycombinator.com/item?id=16009109
  // - crypto random bytes
  // - convert it to pseudo-base62
  // - stored as base64url of sha256
  const data = new Uint8Array(16);

  // Sub this out for something that is actually random
  crypto.getRandomValues(data);

  const raw = Buffer.from(data)
    .toString("base64url")
    .replaceAll(/[-_]/g, (...args) => String.fromCharCode(65 + args[1]));

  const newKey = `pdx_${raw}`;
  const apiKey = await apiKeyAtRest(newKey);
  const db = await dbConn;
  await db
    .update(table.users)
    .set({ apiKey })
    .where(eq(table.users.userId, session.uid));

  return NextResponse.json<NewKeyResponse>({ api_key: newKey });
}

export const POST = withAuth(withDb(handler));
