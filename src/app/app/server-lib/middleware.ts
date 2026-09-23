import { NotFoundError, ValidationError } from "./errors";
import { log, requestLogFields } from "./logging";
import { ZodError } from "zod";
import { flushEvents } from "./posthog";
import type { LoaderFunctionArgs } from "react-router";
import { AuthorizationError } from "@/lib/auth";
import { getCloudflare } from "./cloudflare-context";

function thrownType(err: unknown): string {
  if (err === null) return "null";
  if (typeof err !== "object") return typeof err;
  return err.constructor?.name ?? "object";
}

// Convert the error to the response that the client gets. Only expected
// errors send their message. Unexpected errors send a generic message
// because their message can contain internal data.
function toResponse(err: unknown): Response {
  if (err instanceof Response) {
    return err;
  } else if (err instanceof ValidationError) {
    return Response.json({ name: err.name, msg: err.message }, { status: 400 });
  } else if (err instanceof AuthorizationError) {
    return Response.json({ name: err.name, msg: err.message }, { status: 403 });
  } else if (err instanceof NotFoundError) {
    return Response.json({ name: err.name, msg: `${err.message} not found` }, { status: 404 });
  } else if (err instanceof ZodError) {
    return Response.json(
      { name: "ValidationError", msg: JSON.stringify(err.flatten().fieldErrors) },
      { status: 400 },
    );
  } else {
    return Response.json(
      { name: "InternalServerError", msg: "internal server error" },
      { status: 500 },
    );
  }
}

function logFailure(request: Request, err: unknown, status: number) {
  if (status < 400) return;

  const fields = { ...requestLogFields(request), status };
  if (status < 500) {
    log.info({
      ...fields,
      msg: "request rejected",
      error: err instanceof Error ? err.message : undefined,
    });
  } else if (err instanceof Response) {
    log.error({ ...fields, msg: "route threw an error response" });
  } else {
    log.exception(err, { ...fields, msg: "unexpected exception", thrownType: thrownType(err) });
  }
}

export function withCore<A1 extends LoaderFunctionArgs, T extends Array<unknown>, R>(
  fn: (a1: A1, ...args: T) => Promise<R>,
) {
  return function (a1: A1, ...args: T) {
    return fn(a1, ...args)
      .catch((err: unknown) => {
        const response = toResponse(err);
        logFailure(a1.request, err, response.status);
        throw response;
      })
      .finally(() => {
        getCloudflare(a1.context).ctx.waitUntil(flushEvents());
      });
  };
}
