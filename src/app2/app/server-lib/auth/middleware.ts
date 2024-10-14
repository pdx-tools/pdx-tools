import { apiKeyAtRest, table, useDb } from "../db";
import { eq } from "drizzle-orm";
import { parseBasicAuth } from "./basic";
import { Account } from "../db/schema";
import { json } from "@tanstack/start";
import { useAppSession, usePdxSession } from "./session";

export type Session = { uid: string; account: Account };
export type SessionRoute = { session: Session };
const unauthResponse = () =>
  json({ msg: "unable to authorize" }, { status: 401 });

export function withAuth<Args extends { request: Request }, Ctxt extends object = {}>(
  fn: (
    args: Args,
    context: SessionRoute & Ctxt,
  ) => Promise<Response>,
) {
  return async (
    args: Args,
    ctxt?: Ctxt,
  ): Promise<Response> => {
    const header = args.request.headers.get("authorization");
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

      const newCtxt = ctxt ?? {} as Ctxt;
      return fn(args, {
        ...newCtxt,
        session: { uid: creds.username, account: user.account },
      });
    } else {
      const session = await usePdxSession();
      if (session.kind === "guest") {
        return unauthResponse();
      }

      const newCtxt = ctxt ?? {} as Ctxt;
      return fn(args, {
        ...newCtxt,
        session: { uid: session.userId, account: session.account },
      });
    }
  };
}

export function withAdmin<Args extends { request: Request }, Ctxt extends object = {}>(
  fn: (req: Args, context: Ctxt) => Promise<Response>,
) {
  return withAuth(
    async (
      req: Args,
      ctxt: Ctxt & SessionRoute,
    ): Promise<Response> => {
      if (ctxt.session.account !== "admin") {
        return unauthResponse();
      }

      return fn(req, ctxt);
    },
  );
}
