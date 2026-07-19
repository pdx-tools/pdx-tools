import { createRequestHandler, RouterContextProvider } from "react-router";
import * as Sentry from "@sentry/cloudflare";
import { cloudflareContext } from "./app/server-lib/cloudflare-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export const app = {
  async fetch(request: Request, env: CloudflareWorkerEnv, ctx: ExecutionContext) {
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
      console.log(error);
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
