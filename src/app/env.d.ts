import type * as CloudflareWorkersModule from "cloudflare:workers";

declare global {
  type CloudflareWorkerEnv = CloudflareWorkersModule["env"];
  interface Env extends CloudflareWorkerEnv {}
}
