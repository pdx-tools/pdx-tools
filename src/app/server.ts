import { createRequestHandler, RouterContextProvider } from "react-router";
import * as Sentry from "@sentry/cloudflare";
import { cloudflareContext } from "./app/server-lib/cloudflare-context";
import { log, requestLogFields } from "./app/server-lib/logging";

export { PreviewSaves } from "./app/server-lib/preview-saves";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export const app = {
  async fetch(request: Request, env: CloudflareWorkerEnv, ctx: ExecutionContext) {
    // Crawlers still ask for asset paths of the old Next.js site. A 410 tells
    // them that these files are gone permanently.
    if (new URL(request.url).pathname.startsWith("/_next/")) {
      return new Response(null, { status: 410 });
    }

    try {
      const context = new RouterContextProvider();
      context.set(cloudflareContext, {
        env,
        ctx,
        cf: request.cf,
        caches,
      });
      return await requestHandler(request, context);
    } catch (error) {
      log.exception(error, { ...requestLogFields(request), msg: "unhandled worker error" });
      return new Response("An unexpected error occurred", { status: 500 });
    }
  },
} satisfies ExportedHandler<CloudflareWorkerEnv>;

export default Sentry.withSentry((env: CloudflareWorkerEnv) => {
  const { id: versionId } = env.CF_VERSION_METADATA;

  return {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    enabled: !!import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.0,
    release: versionId,
    sendDefaultPii: true,
  };
}, app);
