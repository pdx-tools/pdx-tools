import { log } from "@/server-lib/logging";
import { pdxMetrics } from "@/server-lib/metrics";
import { pdxStorage } from "@/server-lib/storage";
import { z } from "zod";
import type { Route } from "./+types/api.saves.$saveId.file";

const saveSchema = z.object({ saveId: z.string() });

// Match the cf-cache-status vocabulary
type CacheResult = "HIT" | "MISS";

function responseBytes(response: Response) {
  return Number(response.headers.get("content-length")) || 0;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const startedAt = performance.now();
  const save = saveSchema.parse(params);
  const storage = pdxStorage({ context });
  const metrics = pdxMetrics(context);
  let cacheResult: CacheResult = "MISS";

  try {
    // Need to manually cache save files in cloudflare caches to get hits
    // https://community.cloudflare.com/t/fetch-response-shows-cf-cache-status-dynamic-even-with-cacheeverything-true/299979
    // Based on: https://developers.cloudflare.com/r2/examples/cache-api/
    const url = new URL(request.url);
    const cacheKey = new Request(url.toString(), request);

    const cache = context.cloudflare.caches.default;

    let response = await cache.match(cacheKey);
    if (response) {
      cacheResult = "HIT";
      log.info({ msg: "cache hit", key: save.saveId });
      metrics.record({
        domain: "save_file",
        operation: "save_file_get",
        cacheResult,
        outcome: "success",
        status: response.status,
        elapsedMs: performance.now() - startedAt,
        bytes: responseBytes(response),
      });
      return response;
    }

    log.info({ msg: "cache miss", key: save.saveId });
    const object = await storage.saves.get(save.saveId, {
      onlyIf: request.headers,
    });

    if (object === null) {
      metrics.record({
        domain: "save_file",
        operation: "save_file_get",
        cacheResult,
        outcome: "error",
        status: 404,
        elapsedMs: performance.now() - startedAt,
      });
      return new Response(null, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    // Cloudflare's Cache API only persists responses with a cacheable
    // Cache-Control.
    headers.set("Cache-Control", "public, max-age=86400");

    // A bodyless R2Object means the If-None-Match precondition matched, so the
    // client already has the object: respond 304 and don't (re)cache.
    if (!("body" in object)) {
      response = new Response(null, { status: 304, headers });
    } else {
      response = new Response(object.body, { status: 200, headers });
      context.cloudflare.ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    metrics.record({
      domain: "save_file",
      operation: "save_file_get",
      cacheResult,
      outcome: "success",
      status: response.status,
      elapsedMs: performance.now() - startedAt,
      bytes: responseBytes(response),
    });
    return response;
  } catch (error) {
    metrics.record({
      domain: "save_file",
      operation: "save_file_get",
      cacheResult,
      outcome: "error",
      status: "error",
      elapsedMs: performance.now() - startedAt,
    });
    throw error;
  }
}
