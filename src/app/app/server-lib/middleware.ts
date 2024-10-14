import { AuthorizationError, NotFoundError, ValidationError } from "./errors";
import { log } from "./logging";
import { ZodError } from "zod";
import { flushEvents } from "./posthog";
import { json, LoaderFunctionArgs } from "@remix-run/cloudflare";

export function withCore<
  A1 extends LoaderFunctionArgs,
  T extends Array<any>,
  R,
>(fn: (a1: A1, ...args: T) => Promise<R>) {
  return function (a1: A1, ...args: T) {
    return fn(a1, ...args)
      .catch((err) => {
        if (!(err instanceof Error)) {
          log.exception(err, { msg: "unknown exception" });
          throw json({ msg: `unknown exception` }, { status: 500 });
        }

        const obj = {
          name: err.name,
          msg: err.message,
        };

        if (err.name === ValidationError.name) {
          throw json(obj, { status: 400 });
        } else if (err instanceof AuthorizationError) {
          throw json(obj, { status: 403 });
        } else if (err instanceof NotFoundError) {
          throw json({ ...obj, msg: `${obj.msg} not found` }, { status: 404 });
        } else if (err instanceof ZodError) {
          throw json(
            {
              name: "ValidationError",
              msg: JSON.stringify(err.flatten().fieldErrors),
            },
            { status: 400 },
          );
        } else {
          log.exception(err, { msg: "unexpected exception" });
          throw json(obj, { status: 500 });
        }
      })
      .finally(() => {
        a1.context.cloudflare.ctx.waitUntil(flushEvents());
      });
  };
}
