import { log } from "./logging";
import { pdxMetrics } from "./metrics";
import { pdxStorage } from "./storage";
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
  // A pull request preview has no save bucket. It gets the save file from
  // production through the same public route.
  const { env } = getCloudflare(context);
  if (!env.SAVE_BUCKET && env.SAVE_FILE_ORIGIN) {
    return forwardSaveFile(request, new URL(url.pathname, env.SAVE_FILE_ORIGIN));
  }

  const startedAt = performance.now();
  const storage = pdxStorage({ context, game });
  const metrics = pdxMetrics(context);
  let cacheResult: CacheResult = "MISS";

  try {
    // Need to manually cache save files in cloudflare caches to get hits
    // https://community.cloudflare.com/t/fetch-response-shows-cf-cache-status-dynamic-even-with-cacheeverything-true/299979
    // Based on: https://developers.cloudflare.com/r2/examples/cache-api/
    const cacheKey = new Request(url.toString(), request);

    const cloudflare = getCloudflare(context);
    const cache = cloudflare.caches.default;

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
    const object = await storage.saves.get(saveId, {
      onlyIf: request.headers,
    });

    if (object === null) {
      metrics.record({
        domain: "save_file",
        game,
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
      cloudflare.ctx.waitUntil(cache.put(cacheKey, response.clone()));
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

// Send only the conditional headers. The other request headers (eg. the
// session cookie) are for the preview, not for production.
function forwardSaveFile(request: Request, target: URL) {
  const headers = new Headers();
  for (const name of ["if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return fetch(target, { headers });
}
