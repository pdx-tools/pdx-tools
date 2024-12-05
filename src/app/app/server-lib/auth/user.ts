import { AppLoadContext } from "@remix-run/cloudflare";
import { parseBasicAuth } from "./basic";
import { useDb } from "../db/connection";
import { apiKeyAtRest, table } from "../db";
import { eq } from "drizzle-orm";
import { LoggedInUser } from "@/lib/auth";
import { pdxCookieSession } from "./cookie";

const unauthResponse = () =>
  Response.json({ msg: "unable to authorize" }, { status: 401 });

export async function getSessionUser({
  request,
  context,
}: {
  request: Request;
  context: AppLoadContext;
}): Promise<LoggedInUser> {
  const header = request.headers.get("authorization");
  if (header) {
    const creds = parseBasicAuth(header);
    if (creds === null) {
      throw unauthResponse();
    }

    const users = await useDb(
      context.cloudflare.env.PDX_DB.connectionString,
      (db) =>
        db
          .select({ apiKey: table.users.apiKey, account: table.users.account })
          .from(table.users)
          .where(eq(table.users.userId, creds.username)),
    );
    const user = users[0];

    if (user?.apiKey !== (await apiKeyAtRest(creds.password))) {
      throw unauthResponse();
    }

    return {
      id: creds.username,
      roles: [user.account === "admin" ? "admin" : "user"],
    };
  } else {
    const session = await pdxCookieSession({ request, context }).get();
    if (session.kind === "guest") {
      throw unauthResponse();
    }

    return {
      id: session.userId,
      roles: [session.account === "admin" ? "admin" : "user"],
    };
  }
}
