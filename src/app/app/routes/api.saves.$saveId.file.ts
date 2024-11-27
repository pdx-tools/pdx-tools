import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const saveSchema = z.object({ saveId: z.string() });
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const save = saveSchema.parse(params);
  const s3 = pdxS3(pdxCloudflareS3({ context }));
  const url = s3.url(s3.keys.save(save.saveId));

  // Need to manually cache save files in cloudflare caches to get hits
  // https://community.cloudflare.com/t/fetch-response-shows-cf-cache-status-dynamic-even-with-cacheeverything-true/299979
  const cache =
    "default" in context.cloudflare.caches
      ? context.cloudflare.caches.default
      : await context.cloudflare.caches.open("pdx-cache");

  const cached = await cache.match(url);
  if (cached) {
    return cached;
  }

  const resp = await s3.fetchOk(url, {
    headers: s3.headers(request.headers),
  });

  // We clone the response so that we can use the body more than once (one for
  // the return and the other for the cache).
  const cachedResp = resp.clone();
  context.cloudflare.ctx.waitUntil(cache.put(url, cachedResp));
  return resp;
}
