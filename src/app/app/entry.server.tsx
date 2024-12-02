import type {
  ActionFunctionArgs,
  AppLoadContext,
  EntryContext,
  LoaderFunctionArgs,
} from "@remix-run/cloudflare";
import * as Sentry from "@sentry/remix";
import { RemixServer } from "@remix-run/react";
import { renderToReadableStream } from "react-dom/server";
import { log } from "./server-lib/logging";

const SENTRY_DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.0,
  });
}

const ABORT_DELAY = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  loadContext: AppLoadContext,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ABORT_DELAY);

  const globalCsp = [
    "default-src 'self'",
    "connect-src 'self' blob: https://skanderbeg.pm/api.php",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
  ];

  const body = await renderToReadableStream(
    <RemixServer
      context={remixContext}
      url={request.url}
      abortDelay={ABORT_DELAY}
    />,
    {
      signal: controller.signal,
      onError(error: unknown) {
        if (!controller.signal.aborted) {
          log.exception(error, { msg: "streaming error" });
          Sentry.captureException(error, {
            extra: { url: request.url },
          });
          loadContext.cloudflare.ctx.waitUntil(Sentry.flush(2000));
        }
        responseStatusCode = 500;
      },
    },
  );

  body.allReady.then(() => clearTimeout(timeoutId));

  responseHeaders.set("Content-Type", "text/html");
  responseHeaders.set("Content-Security-Policy", globalCsp.join("; "));
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

export function handleError(
  error: unknown,
  { request, context }: LoaderFunctionArgs | ActionFunctionArgs,
) {
  if (
    !request.signal.aborted &&
    !(
      typeof error === "object" && // Don't log 404 errors
      error !== null &&
      "status" in error &&
      error.status === 404
    )
  ) {
    log.exception(error, { msg: "server error" });
    Sentry.captureException(error, {
      extra: { url: request.url },
    });
    context.cloudflare.ctx.waitUntil(Sentry.flush(2000));
  }
}
