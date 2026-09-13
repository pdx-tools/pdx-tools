import { daysBetween } from "../lib/eu5Date";
import type { Eu5DateComponents } from "@/wasm/wasm_eu5";

export type YearTick = {
  year: number;
  /** Days after the campaign start. */
  day: number;
  labeled: boolean;
};

const LABEL_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

/** The smallest px gap between two year labels that stays readable. */
const MIN_LABEL_GAP_PX = 44;
/** Below this many px per year, unlabeled year ticks become noise. */
const MIN_MINOR_TICK_PX = 6;

/**
 * Year ticks across a campaign. Every January 1st inside the range is a tick
 * when the scale has room for it; labels thin out to a round step so no two
 * labels collide at the given width.
 */
export function buildYearTicks(
  start: Eu5DateComponents,
  end: Eu5DateComponents,
  width: number,
): YearTick[] {
  const totalDays = daysBetween(start, end);
  if (totalDays <= 0 || width <= 0) return [];

  const pxPerYear = (width / totalDays) * 365;
  const labelStep =
    LABEL_STEPS.find((step) => step * pxPerYear >= MIN_LABEL_GAP_PX) ?? LABEL_STEPS.at(-1)!;
  const showMinor = pxPerYear >= MIN_MINOR_TICK_PX;

  const ticks: YearTick[] = [];
  const firstYear = start.month === 1 && start.day === 1 ? start.year : start.year + 1;
  for (let year = firstYear; year <= end.year; year++) {
    const day = daysBetween(start, { year, month: 1, day: 1 });
    if (day > totalDays) break;
    const labeled = year % labelStep === 0;
    if (!labeled && !showMinor) continue;
    ticks.push({ year, day, labeled });
  }
  return ticks;
}

export type DensityBar = {
  /** Left edge in px. */
  x: number;
  /** Width in px. */
  w: number;
  /** 0..1, log scaled so a quiet year still registers next to a civil war. */
  level: number;
  /** Days after the campaign start of the first change in the bar. */
  firstDay: number;
};

/**
 * Bucket the border changes into px columns. The result is the activity
 * strip under the track: where borders moved, and how much.
 */
export function buildDensity(
  changeDays: readonly number[],
  changeCounts: readonly number[],
  totalDays: number,
  width: number,
  bucketPx: number,
): DensityBar[] {
  if (totalDays <= 0 || width <= 0) return [];
  const buckets = Math.max(1, Math.floor(width / bucketPx));
  const counts = new Float64Array(buckets);
  const firstDays = new Int32Array(buckets).fill(-1);
  for (let i = 0; i < changeDays.length; i++) {
    const day = changeDays[i];
    const bucket = Math.min(buckets - 1, Math.floor((day / totalDays) * buckets));
    counts[bucket] += changeCounts[i] ?? 1;
    if (firstDays[bucket] < 0) firstDays[bucket] = day;
  }

  let max = 0;
  for (const count of counts) max = Math.max(max, count);
  if (max === 0) return [];

  const bars: DensityBar[] = [];
  const w = width / buckets;
  for (let i = 0; i < buckets; i++) {
    if (counts[i] === 0) continue;
    bars.push({
      x: i * w,
      w,
      level: Math.log1p(counts[i]) / Math.log1p(max),
      firstDay: firstDays[i],
    });
  }
  return bars;
}
