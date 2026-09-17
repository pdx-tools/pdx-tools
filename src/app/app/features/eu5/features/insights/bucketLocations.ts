import type { LocationDistribution } from "@/wasm/wasm_eu5";

/**
 * The client-side twin of the workspace's `location_distribution`: profile
 * pages bucket the rows they already hold instead of asking the worker.
 * Same target bucket count, same nice steps, same nearest-rank percentiles.
 */
export function bucketLocations(metricLabel: string, values: number[]): LocationDistribution {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return { metricLabel, buckets: [], median: 0, p90: 0, topLocations: [] };
  }

  const sorted = [...finiteValues].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const p90 = percentile(sorted, 0.9);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  if (Math.abs(max - min) < Number.EPSILON) {
    return {
      metricLabel,
      buckets: [{ lo: min, hi: max, count: finiteValues.length }],
      median,
      p90,
      topLocations: [],
    };
  }

  const targetBuckets = 20;
  const step = niceBucketStep(max - min, targetBuckets);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const bucketCount = Math.max(1, Math.min(targetBuckets * 2, Math.ceil((end - start) / step)));
  const counts = Array.from({ length: bucketCount }, () => 0);

  for (const value of finiteValues) {
    const index = Math.min(bucketCount - 1, Math.floor((value - start) / step));
    counts[index] += 1;
  }

  return {
    metricLabel,
    buckets: counts.map((count, index) => ({
      lo: start + index * step,
      hi: start + (index + 1) * step,
      count,
    })),
    median,
    p90,
    topLocations: [],
  };
}

/** The nearest-rank percentile of values sorted low to high. */
function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  return sortedAsc[Math.round((sortedAsc.length - 1) * q)] ?? 0;
}

function niceBucketStep(range: number, targetBuckets: number): number {
  const rawStep = range / Math.max(1, targetBuckets);
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}
