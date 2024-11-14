import { AppLoadContext } from "@remix-run/cloudflare";
import { DbConnection, usingDb } from "./connection";

export type DbRoute = { db: DbConnection };
export function withDb<
  Args extends { request: Request; context: AppLoadContext },
  R,
  Ctxt = object,
>(fn: (args: Args, context: DbRoute & Ctxt) => R) {
  return async (args: Args, ctxt?: Ctxt) => {
    const { db, close } = usingDb(args.context);
    try {
      const newCtxt = ctxt ?? ({} as Ctxt);
      return await fn(args, { ...newCtxt, db });
    } finally {
      close();
    }
  };
}
