import { createRequestHandler } from "react-router";
import * as Sentry from "@sentry/cloudflare";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: CloudflareWorkerEnv;
      ctx: ExecutionContext;
      cf: CfProperties<unknown> | undefined;
      caches: typeof caches;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export const app = {
  async fetch(
    request: Request,
    env: CloudflareWorkerEnv,
    ctx: ExecutionContext,
  ) {
    try {
      return await requestHandler(request, {
        cloudflare: {
          env,
          ctx,
          cf: request.cf,
          caches,
        },
      });
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
