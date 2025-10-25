import type {
  ActionFunctionArgs,
  EntryContext,
  LoaderFunctionArgs,
} from "react-router";
import { ServerRouter } from "react-router";
import { renderToReadableStream } from "react-dom/server";
import { log } from "./server-lib/logging";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  const controller = new AbortController();

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
        }
        responseStatusCode = 500;
      },
    },
  );

  responseHeaders.set("Content-Type", "text/html");
  responseHeaders.set("Content-Security-Policy", globalCsp.join("; "));
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

export function handleError(
  error: unknown,
  { request }: LoaderFunctionArgs | ActionFunctionArgs,
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
  }
}
