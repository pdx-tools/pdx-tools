import { eq } from "drizzle-orm";
import { table, withDb } from "@/server-lib/db";
import { NextResponse } from "next/server";
import { newSessionCookie } from "@/server-lib/auth/session";
import { withCore } from "@/server-lib/middleware";
import { check } from "@/lib/isPresent";

const TEST_UID = "100";

// This route is only for tests and development!
const handler = withCore(
  withDb(async (req: Request, { dbConn }) => {
    const db = await dbConn;
    const users = await db
      .select()
      .from(table.users)
      .where(eq(table.users.userId, TEST_UID));
    let user = users[0];

    if (!user) {
      const [newUser] = await db
        .insert(table.users)
        .values({
          userId: TEST_UID,
          steamId: "1000",
          steamName: "my-steam-name",
          account: "admin",
        })
        .returning();
      user = check(newUser, "new user is not null");
    }

    const cookie = await newSessionCookie({
      userId: TEST_UID,
      steamId: "1000",
      account: user.account,
    });
    const dest = new URL("/", req.url);
    const response = NextResponse.redirect(dest, 302);
    response.cookies.set(cookie);
    return response;
  }),
);

export const POST =
  process.env["NODE_ENV"] === "production" ? undefined : handler;
