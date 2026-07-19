import { createContext } from "react-router";
import type { RouterContextProvider } from "react-router";

export type CloudflareContext = {
  env: CloudflareWorkerEnv;
  ctx: ExecutionContext;
  cf: CfProperties<unknown> | undefined;
  caches: typeof caches;
};

export const cloudflareContext = createContext<CloudflareContext>();

export type PdxRouteContext = Readonly<RouterContextProvider>;

export const getCloudflare = (context: PdxRouteContext) => context.get(cloudflareContext);
