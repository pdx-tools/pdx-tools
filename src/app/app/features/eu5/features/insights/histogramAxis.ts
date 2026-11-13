/** The range of one bar of a histogram. A bin of one value has `lo` equal to `hi`. */
type Bin = { lo: number; hi: number };

/** A number on a histogram's axis. `at` counts bins from the left edge of the plot. */
export type BinTick = { at: number; value: number };

/**
 * The places on a histogram's axis that can have a number: each edge between
 * two bins, and the middle of a bin of one value, such as the zero bin of a
 * log ladder.
 */
export function binTicks(bins: readonly Bin[]): BinTick[] {
  const ticks: BinTick[] = [];
  bins.forEach((bin, i) => {
    if (bin.lo === bin.hi) ticks.push({ at: i + 0.5, value: bin.lo });
    // After a bin of one value, the next edge can have the same number.
    else if (ticks.at(-1)?.value !== bin.lo) ticks.push({ at: i, value: bin.lo });
  });
  const last = bins.at(-1);
  if (last && last.lo !== last.hi) ticks.push({ at: bins.length, value: last.hi });
  return ticks;
}

/** True if the bins of a range all have one width. Bins on a 1-2-5 ladder do not. */
function sameWidth(bins: readonly Bin[]): boolean {
  const widths = bins.filter((b) => b.lo !== b.hi).map((b) => b.hi - b.lo);
  return widths.every((w) => Math.abs(w - widths[0]!) <= Math.abs(widths[0]!) * 1e-6);
}

/**
 * Where a value is on a histogram's axis, from 0 to the number of bins: a
 * fraction of the way across the bin that holds it. Across a bin of a ladder,
 * the fraction is on a log scale, as the ladder is.
 */
export function binCoord(bins: readonly Bin[], value: number): number | null {
  const last = bins.length - 1;
  const i = bins.findIndex(
    (b, idx) => (b.lo === b.hi ? value === b.lo : value < b.hi) || idx === last,
  );
  const bin = bins[i];
  if (!bin) return null;
  if (bin.lo === bin.hi) return i + 0.5;
  const t =
    bin.lo > 0 && value > 0 && !sameWidth(bins)
      ? Math.log(value / bin.lo) / Math.log(bin.hi / bin.lo)
      : (value - bin.lo) / (bin.hi - bin.lo);
  return i + Math.min(1, Math.max(0, t));
}

const isMultiple = (value: number, of: number) => {
  const ratio = value / of;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
};

/** The round steps from `gap` up that are a whole number of gaps, such as 5, 10, 20, 25, 50 */
function roundSteps(gap: number): number[] {
  const first = Math.floor(Math.log10(gap));
  return Array.from({ length: 5 }, (_, i) => first + i)
    .flatMap((power) => [1, 2, 2.5, 5].map((m) => m * 10 ** power))
    .filter((step) => step >= gap * (1 - 1e-6) && isMultiple(step, gap));
}

/**
 * The ticks that have a number: the round ones, at most `maxLabels`. Bins of
 * one width label the multiples of a round step. Bins on a 1-2-5 ladder have
 * no common step, so they label the powers of 10.
 */
export function roundTicks(ticks: readonly BinTick[], maxLabels = 6): BinTick[] {
  if (ticks.length <= maxLabels) return [...ticks];

  const gaps = ticks.slice(1).map((tick, i) => tick.value - ticks[i]!.value);
  const gap = gaps[0]!;
  const uniform = gaps.every((g) => Math.abs(g - gap) <= Math.abs(gap) * 1e-6);
  const candidates = uniform
    ? roundSteps(Math.abs(gap)).map((step) => ticks.filter((t) => isMultiple(t.value, step)))
    : [ticks.filter((t) => t.value === 0 || isMultiple(Math.log10(Math.abs(t.value)), 1))];
  const round = candidates.find((c) => c.length >= 2 && c.length <= maxLabels);
  if (round) return round;

  const stride = Math.ceil(ticks.length / maxLabels);
  return ticks.filter((_, i) => i % stride === 0);
}

/**
 * The two x axes of a histogram. The bars stand on a category axis with no
 * text. A value axis from 0 to the number of bins has the numbers, so that a
 * number stands on the edge between two bins, and not on the middle of a bar
 * that holds a range of values. Each number takes the first of `forms` that
 * gives each tick different text, so a compact form can fall back to a full one.
 */
export function histogramXAxes(
  bins: readonly Bin[],
  forms: readonly [(value: number) => string, ...((value: number) => string)[]],
  name?: string,
) {
  const ticks = roundTicks(binTicks(bins));
  const textAt = new Map<number, string>();
  const form =
    forms.find((f) => new Set(ticks.map((t) => f(t.value))).size === ticks.length) ?? forms.at(-1)!;
  for (const tick of ticks) textAt.set(tick.at, form(tick.value));
  const at = ticks.map((tick) => tick.at);
  return [
    {
      type: "category" as const,
      data: bins.map((_, i) => i),
      axisLabel: { show: false },
      axisTick: { show: false },
    },
    {
      type: "value" as const,
      position: "bottom" as const,
      min: 0,
      max: bins.length,
      name,
      nameLocation: "middle" as const,
      nameGap: 26,
      axisLabel: {
        customValues: at,
        formatter: (position: number) => textAt.get(position) ?? "",
      },
      axisTick: { show: true, customValues: at },
      axisLine: { show: false },
      splitLine: { show: false },
      axisPointer: { show: false },
    },
  ];
}

/** The space between two labels on one row, in px */
const LABEL_GAP = 6;
/** The space between a label and its line, in px */
export const LABEL_PAD = LABEL_GAP / 2;

/**
 * Where the median and p90 labels of a histogram go. The value is the edge of
 * the text that is on the line: "right" puts the text before the line. The
 * median's text ends on its line and the p90's text starts on its line, so the
 * two go apart and stay on one row. A label that goes out of the chart goes to
 * the other side of its line. The labels use two rows only when they then
 * overlap.
 */
export function histogramLabels({
  median,
  p90,
  plotWidth,
  gutter,
}: {
  /** `at` is the position of the line, from 0 to 1 across the plot, and `width` is in px */
  median: { at: number; width: number };
  p90: { at: number; width: number };
  plotWidth: number;
  gutter: { left: number; right: number };
}): { median: "left" | "right"; p90: "left" | "right"; stacked: boolean } {
  const medianX = median.at * plotWidth;
  const p90X = p90.at * plotWidth;
  const medianWidth = median.width + LABEL_PAD;
  const p90Width = p90.width + LABEL_PAD;
  const medianAlign = medianX - medianWidth >= -gutter.left ? "right" : "left";
  const p90Align = p90X + p90Width <= plotWidth + gutter.right ? "left" : "right";
  const medianEnd = medianAlign === "right" ? medianX : medianX + medianWidth;
  const p90Start = p90Align === "left" ? p90X : p90X - p90Width;
  // Labels that go apart have their lines and pads between them, so only other pairs can overlap.
  const apart = medianAlign === "right" && p90Align === "left";
  return {
    median: medianAlign,
    p90: p90Align,
    stacked: !apart && medianEnd + LABEL_GAP > p90Start,
  };
}
