import { log } from "./logging";
import { pdxMetrics } from "./metrics";
import { saveObjectResponse } from "./save-object-response";
import { required } from "./storage";
import { getCloudflare } from "./cloudflare-context";
import type { PdxRouteContext } from "./cloudflare-context";

// Match the cf-cache-status vocabulary
type CacheResult = "HIT" | "MISS";

function responseBytes(response: Response) {
  return Number(response.headers.get("content-length")) || 0;
}

/** Respond with a stored save file, through the Cloudflare cache. */
export async function saveFileResponse({
  request,
  url,
  context,
  saveId,
  game,
}: {
  request: Request;
  url: URL;
  context: PdxRouteContext;
  saveId: string;
  game: "eu4" | "eu5";
}) {
  // Previews have no bucket binding, so read public saves through production.
  const { env, caches, ctx } = getCloudflare(context);
  if (!env.SAVE_BUCKET) {
    return required(env.PREVIEW_SAVES, "PREVIEW_SAVES").getSave(game, saveId, {
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
      ifModifiedSince: request.headers.get("if-modified-since") ?? undefined,
    });
  }

  const startedAt = performance.now();
  const metrics = pdxMetrics(context);
  let cacheResult: CacheResult = "MISS";

  try {
    // Need to manually cache save files in cloudflare caches to get hits
    // https://community.cloudflare.com/t/fetch-response-shows-cf-cache-status-dynamic-even-with-cacheeverything-true/299979
    // Based on: https://developers.cloudflare.com/r2/examples/cache-api/
    const cacheKey = new Request(url.toString(), request);

    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (response) {
      cacheResult = "HIT";
      log.info({ msg: "cache hit", key: saveId });
      metrics.record({
        domain: "save_file",
        game,
        operation: "save_file_get",
        cacheResult,
        outcome: "success",
        status: response.status,
        elapsedMs: performance.now() - startedAt,
        bytes: responseBytes(response),
      });
      return response;
    }

    log.info({ msg: "cache miss", key: saveId });
    response = await saveObjectResponse(env.SAVE_BUCKET, game, saveId, request.headers);

    if (response.status === 404) {
      metrics.record({
        domain: "save_file",
        game,
        operation: "save_file_get",
        cacheResult,
        outcome: "error",
        status: 404,
        elapsedMs: performance.now() - startedAt,
      });
      return response;
    }

    if (response.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    metrics.record({
      domain: "save_file",
      game,
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
      game,
      operation: "save_file_get",
      cacheResult,
      outcome: "error",
      status: "error",
      elapsedMs: performance.now() - startedAt,
    });
    throw error;
  }
}
