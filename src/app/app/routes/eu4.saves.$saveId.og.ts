import { redirect } from "react-router";
import { pdxMetrics } from "@/server-lib/metrics";
import { pdxStorage } from "@/server-lib/storage";
import { mediaOrigin } from "@/lib/media";
import { z } from "zod";
import type { Route } from "./+types/eu4.saves.$saveId.og";

const saveSchema = z.object({ saveId: z.string().regex(/^[a-z0-9_-]*$/i) });

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const save = saveSchema.parse(params);

  // Production serves previews straight from the cacheable media host. This
  // route remains only as a compatibility redirect for existing URLs.
  if (mediaOrigin) {
    return redirect(`${mediaOrigin}/eu4/og/${save.saveId}.webp`, 301);
  }

  // Dev/test: media.pdx.tools is unreachable, so serve the bytes from the local
  // MEDIA_BUCKET binding.
  const startedAt = performance.now();
  const storage = pdxStorage({ context });
  const metrics = pdxMetrics(context);
  const object = await storage.previews.get(save.saveId, {
    onlyIf: request.headers,
  });

  if (object === null) {
    metrics.record({
      domain: "og",
      operation: "og_get",
      cacheResult: "unknown",
      outcome: "error",
      status: 404,
      elapsedMs: performance.now() - startedAt,
    });
    return new Response(null, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);

  const response =
    "body" in object
      ? new Response(object.body, { status: 200, headers })
      : new Response(null, { status: 304, headers });

  metrics.record({
    domain: "og",
    operation: "og_get",
    cacheResult: "unknown",
    outcome: response.status < 400 ? "success" : "error",
    status: response.status,
    elapsedMs: performance.now() - startedAt,
    bytes: Number(response.headers.get("content-length")) || 0,
  });

  return response;
}
