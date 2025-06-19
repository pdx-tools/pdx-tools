import type {
  ActionFunctionArgs,
  AppLoadContext,
  EntryContext,
  LoaderFunctionArgs,
} from "react-router";
import { ServerRouter } from "react-router";
import { renderToReadableStream } from "react-dom/server";
import { log } from "./server-lib/logging";
import { captureException, flushEvents } from "./server-lib/posthog";

const ABORT_DELAY = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  loadContext: AppLoadContext,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ABORT_DELAY);

  const globalCsp = [
    "default-src 'self'",
    "connect-src 'self' blob:",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
  ];

  const body = await renderToReadableStream(
    <ServerRouter context={reactRouterContext} url={request.url} />,
    {
      signal: controller.signal,
      onError(error: unknown) {
        if (!controller.signal.aborted) {
          log.exception(error, { msg: "streaming error" });
          if (error instanceof Error) {
            captureException(error, "ssr_error", {
              url: request.url,
            });

            loadContext.cloudflare.ctx.waitUntil(flushEvents());
          }
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

    if (error instanceof Error) {
      captureException(error, "server_error", {
        url: request.url,
      });

      context.cloudflare.ctx.waitUntil(flushEvents());
    }
  }
}
