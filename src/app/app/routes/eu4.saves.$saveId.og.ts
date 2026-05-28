import { timeit } from "@/lib/timeit";
import { pdxMetrics } from "@/server-lib/metrics";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { z } from "zod";
import type { Route } from "./+types/eu4.saves.$saveId.og";

const saveSchema = z.object({ saveId: z.string().regex(/^[a-z0-9_-]*$/i) });

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const startedAt = performance.now();
  const save = saveSchema.parse(params);
  const s3 = pdxS3(pdxCloudflareS3({ context }));

  const fetch = await timeit(() =>
    s3.fetch(s3.keys.preview(save.saveId), {
      headers: s3.headers(request.headers),
    }),
  );
  const response = fetch.data;

  pdxMetrics(context).record({
    domain: "og",
    operation: "og_get",
    cacheResult: response.headers.get("cf-cache-status") ?? "unknown",
    outcome: response.status < 400 ? "success" : "error",
    status: response.status,
    elapsedMs: performance.now() - startedAt,
    bytes: Number(response.headers.get("content-length")) || 0,
  });

  return response;
}
