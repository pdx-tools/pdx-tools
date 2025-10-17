import { NotFoundError, ValidationError } from "./errors";
import { log } from "./logging";
import { ZodError } from "zod";
import { flushEvents } from "./posthog";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { AuthorizationError } from "@/lib/auth";

export function withCore<
  A1 extends LoaderFunctionArgs,
  T extends Array<unknown>,
  R,
>(fn: (a1: A1, ...args: T) => Promise<R>) {
  return function (a1: A1, ...args: T) {
    return fn(a1, ...args)
      .catch((err) => {
        if (!(err instanceof Error)) {
          log.exception(err, { msg: "unknown exception" });
          throw Response.json({ msg: `unknown exception` }, { status: 500 });
        }

        const obj = {
          name: err.name,
          msg: err.message,
        };

        if (err instanceof ValidationError) {
          throw Response.json(obj, { status: 400 });
        } else if (err instanceof AuthorizationError) {
          throw Response.json(obj, { status: 403 });
        } else if (err instanceof NotFoundError) {
          throw Response.json(
            { ...obj, msg: `${obj.msg} not found` },
            { status: 404 },
          );
        } else if (err instanceof ZodError) {
          throw Response.json(
            {
              name: "ValidationError",
              msg: JSON.stringify(err.flatten().fieldErrors),
            },
            { status: 400 },
          );
        } else {
          log.exception(err, { msg: "unexpected exception" });
          throw Response.json(obj, { status: 500 });
        }
      })
      .finally(() => {
        a1.context.cloudflare.ctx.waitUntil(flushEvents());
      });
  };
}
