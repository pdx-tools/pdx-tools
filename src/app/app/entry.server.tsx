import type { AppLoadContext, EntryContext } from "@remix-run/cloudflare";
import { RemixServer } from "@remix-run/react";
import { renderToReadableStream } from "react-dom/server";

const ABORT_DELAY = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  // This is ignored so we can keep it in the template for visibility.  Feel
  // free to delete this parameter in your app if you're not using it!
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          // Log streaming rendering errors from inside the shell
          console.error(error);
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
