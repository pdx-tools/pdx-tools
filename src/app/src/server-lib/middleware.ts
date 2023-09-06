import { NextApiHandler } from "next";
import { ValidationError, withErrorHandling } from "./errors";
import { log, withLogger } from "./logging";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const withCoreMiddleware = (fn: NextApiHandler): NextApiHandler => {
  return withLogger(withErrorHandling(fn));
};

export function withCore<T extends Array<any>>(
  fn: (...args: T) => Promise<any>,
) {
  return function (...args: T) {
    return fn(...args).catch((err) => {
      if (!(err instanceof Error)) {
        log.exception(err, { msg: "unknown exception" });
        return NextResponse.json({ msg: `unknown exception` }, { status: 500 });
      }

      const obj = {
        name: err.name,
        msg: err.message,
      };

      if (err.name === ValidationError.name) {
        return NextResponse.json(obj, { status: 400 });
      } else if (err instanceof ZodError) {
        return NextResponse.json(
          {
            name: "ValidationError",
            msg: JSON.stringify(err.flatten().fieldErrors),
          },
          { status: 400 },
        );
      } else {
        log.exception(err, { msg: "unexpected exception" });
        return NextResponse.json(obj, { status: 500 });
      }
    });
  };
}
