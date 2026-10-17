import type * as CloudflareWorkersModule from "cloudflare:workers";
import type { PreviewSaves } from "./app/server-lib/preview-saves";

declare global {
  // Wrangler does not generate types for preview bindings.
  type CloudflareWorkerEnv = CloudflareWorkersModule["env"] & {
    PREVIEW_SAVES?: Service<PreviewSaves>;
  };
  interface Env extends CloudflareWorkerEnv {}

  // The DOM lib's `CacheStorage` omits Cloudflare's per-zone `default` cache,
  // which the Workers runtime always exposes. Augment it back in.
  interface CacheStorage {
    readonly default: Cache;
  }
}
