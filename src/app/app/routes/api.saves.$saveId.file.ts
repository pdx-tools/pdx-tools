import { log } from "@/server-lib/logging";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { z } from "zod";
import type { Route } from "./+types/api.saves.$saveId.file";

const saveSchema = z.object({ saveId: z.string() });
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const save = saveSchema.parse(params);
  const s3 = pdxS3(pdxCloudflareS3({ context }));

  // Need to manually cache save files in cloudflare caches to get hits
  // https://community.cloudflare.com/t/fetch-response-shows-cf-cache-status-dynamic-even-with-cacheeverything-true/299979
  // Based on: https://developers.cloudflare.com/r2/examples/cache-api/
  const url = new URL(request.url);
  const cacheKey = new Request(url.toString(), request);

  let cache: Cache;
  if ("default" in context.cloudflare.caches) {
    cache = context.cloudflare.caches.default as Cache;
  } else {
    cache = await context.cloudflare.caches.open("pdx-cache");
  }

  let response = await cache.match(cacheKey);
  if (response) {
    log.info({ msg: "cache hit", key: save.saveId });
    return response;
  }

  log.info({ msg: "cache miss", key: save.saveId });
  response = await s3.fetchOk(s3.keys.save(save.saveId), {
    headers: s3.headers(request.headers),
  });

  // We clone the response so that we can use the body more than once (one for
  // the return and the other for the cache).
  context.cloudflare.ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
