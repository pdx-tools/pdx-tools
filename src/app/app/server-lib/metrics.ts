import type { AppLoadContext } from "react-router";

// All backend metrics share a single Analytics Engine dataset (`pdx_metrics`)
// with a fixed positional schema. Every writeDataPoint must agree on what each
// column means, otherwise a dashboard can't interpret them coherently:
//
//   index1  = domain        (sampling key + coarse filter)
//   blob1   = operation     (primary discriminator)
//   blob2   = cache_result  (cache_hit/cache_miss/HIT/MISS/n/a)
//   blob3   = outcome       (success/error)
//   blob4   = status        (HTTP status, or "error"/"n/a")
//   double1 = count         (always 1, for SUM(_sample_interval * double1))
//   double2 = elapsed_ms    (latency of the operation)
//   double3 = bytes         (payload size; 0 only on an early error)
export type MetricDomain = "save_file" | "og" | "parse_api";

export type MetricOperation =
  | "save_file_get"
  | "save_file_put"
  | "og_get"
  | "og_put"
  | "parse_save"
  | "render_screenshot";

export type Metric = {
  domain: MetricDomain;
  operation: MetricOperation;
  outcome: "success" | "error";
  cacheResult?: string;
  status?: number | string;
  elapsedMs: number;
  bytes?: number;
};

export const pdxMetrics = (context: AppLoadContext) => ({
  record: (m: Metric) => {
    context.cloudflare.env.PDX_METRICS.writeDataPoint({
      indexes: [m.domain],
      blobs: [m.operation, m.cacheResult ?? "n/a", m.outcome, String(m.status ?? "n/a")],
      doubles: [1, m.elapsedMs, m.bytes ?? 0],
    });
  },
});
