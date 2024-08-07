import { NextRequest, NextResponse } from "next/server";
import { apiKeyAtRest, table, useDb } from "../db";
import { eq } from "drizzle-orm";
import { parseBasicAuth } from "./basic";
import { getSessionPayload } from "./session";
import { Account } from "../db/schema";

export type SessionRoute = { session: { uid: string; account: Account } };
const unauthResponse = () =>
  NextResponse.json({ msg: "unable to authorize" }, { status: 401 });

export function withAuth<T = unknown, Ctxt extends object = {}>(
  fn: (
    req: NextRequest,
    context: SessionRoute & Ctxt,
  ) => Promise<NextResponse<T> | Response>,
) {
  return async (
    req: NextRequest,
    ctxt: Ctxt,
  ): Promise<NextResponse<T> | Response> => {
    const header = req.headers.get("authorization");
    if (header) {
      const creds = parseBasicAuth(header);
      if (creds === null) {
        return unauthResponse();
      }

      const users = await useDb((db) =>
        db
          .select({ apiKey: table.users.apiKey, account: table.users.account })
          .from(table.users)
          .where(eq(table.users.userId, creds.username)),
      );
      const user = users[0];

      if (user?.apiKey !== (await apiKeyAtRest(creds.password))) {
        return unauthResponse();
      }

      return fn(req, {
        ...ctxt,
        session: { uid: creds.username, account: user.account },
      });
    } else {
      const session = await getSessionPayload(req);
      if (!session) {
        return unauthResponse();
      }

      return fn(req, {
        ...ctxt,
        session: { uid: session.userId, account: session.account },
      });
    }
  };
}

export function withAdmin<T = unknown, Ctxt extends object = {}>(
  fn: (req: NextRequest, context: Ctxt) => Promise<NextResponse<T> | Response>,
) {
  return withAuth(
    async (
      req: NextRequest,
      ctxt: Ctxt & SessionRoute,
    ): Promise<NextResponse<T> | Response> => {
      if (ctxt.session.account !== "admin") {
        return unauthResponse();
      }

      return fn(req, ctxt);
    },
  );
}
