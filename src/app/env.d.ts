import type * as CloudflareWorkersModule from "cloudflare:workers";

declare global {
  type CloudflareWorkerEnv = CloudflareWorkersModule["env"];
  interface Env extends CloudflareWorkerEnv {}

  // The DOM lib's `CacheStorage` omits Cloudflare's per-zone `default` cache,
  // which the Workers runtime always exposes. Augment it back in.
  interface CacheStorage {
    readonly default: Cache;
  }
}
