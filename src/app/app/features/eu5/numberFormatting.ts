function numberFormat(options: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(undefined, { signDisplay: "negative", ...options });
}

const fixedFormatters = [0, 1, 2].map((digits) =>
  numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }),
);
const percentFormatter = numberFormat({
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const rateFormatter = numberFormat({
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const tickFormatter = numberFormat({ maximumSignificantDigits: 3 });
const percentTickFormatter = numberFormat({ style: "percent", maximumSignificantDigits: 3 });
const exactFormatter = numberFormat({ maximumFractionDigits: 2 });
const exactPercentFormatter = numberFormat({ style: "percent", maximumFractionDigits: 2 });

const COMPACT_UNITS = [
  { size: 1_000_000_000, suffix: "B" },
  { size: 1_000_000, suffix: "M" },
  { size: 1_000, suffix: "K" },
] as const;

/**
 * An amount in a list or a stat line: one decimal, and a unit when the value is
 * 1,000 or more, for example 72.2, 958.0, 14.3K, 9.1K, 22.9M. The decimal column
 * lines up in each list and in each view of one metric.
 */
export function formatMetric(x: number): string {
  const abs = Math.abs(x);
  // A value that rounds to zero is not zero, so it does not read "0.0".
  if (abs > 0 && abs < 0.05) return `${x < 0 ? "-" : ""}<${fixedFormatters[1].format(0.1)}`;
  // A unit starts where the value rounds to 1,000 of the unit under it, so 999.96 is 1.0K.
  const unit = COMPACT_UNITS.find((u) => Number(((abs * 1000) / u.size).toFixed(1)) >= 1000);
  return `${formatFixed(x / (unit?.size ?? 1), 1)}${unit?.suffix ?? ""}`;
}

/**
 * A tick on a chart's axis: the form of `formatMetric` with no zeros at the
 * end, because a tick is a round number. For example 0.5, 20, 5K, 10M.
 */
export function formatTick(x: number): string {
  const unit = COMPACT_UNITS.find((u) => Math.abs(x) >= u.size);
  return `${tickFormatter.format(unit ? x / unit.size : x)}${unit?.suffix ?? ""}`;
}

/** A tick on a percent axis, from a ratio: 50%, 12.5% */
export function formatPercentTick(ratio: number): string {
  return percentTickFormatter.format(ratio);
}

/** A count: an integer under 1,000 (no 958.0), then the form of `formatMetric` */
export function formatCount(x: number): string {
  const rounded = Math.round(x);
  return Math.abs(rounded) >= 1_000 ? formatMetric(rounded) : formatFixed(rounded, 0);
}

/**
 * An amount in one column of a sortable table: a fixed number of decimals, so
 * that the place values align down the column. A narrow list uses `formatMetric`.
 */
export function formatFixed(x: number, digits: 0 | 1 | 2): string {
  return fixedFormatters[digits].format(x);
}

/**
 * A share or a ratio from 0 to 1 as a percent: one decimal in each list, table
 * and chart. A small value that is not zero reads "<0.1%" and never "0.0%".
 */
export function formatPercent(ratio: number): string {
  const abs = Math.abs(ratio);
  if (abs > 0 && abs < 0.001) return `${ratio < 0 ? "-" : ""}<${percentFormatter.format(0.001)}`;
  return percentFormatter.format(ratio);
}

/** A yearly rate, such as growth: two decimals, because its values are small, and a sign. */
export function formatRate(ratio: number): string {
  return rateFormatter.format(ratio);
}

/** The full value behind a compact figure, such as 12,073.9 behind 12.1K */
export function formatExact(x: number): string {
  const abs = Math.abs(x);
  // A value that rounds to zero is not zero, so it does not read "0".
  if (abs > 0 && abs < 0.005) return `${x < 0 ? "-" : ""}<${exactFormatter.format(0.01)}`;
  return exactFormatter.format(x);
}

/** True if a figure with these decimals, and no unit, loses nothing of `formatExact` */
function showsInFull(x: number, digits: number): boolean {
  const rounded = Number(x.toFixed(2));
  return Math.abs(rounded) < 1000 && Number(rounded.toFixed(digits)) === rounded;
}

/** The full value of an amount, such as 12,073.9 behind 12.1K, if a compact figure hides one */
export function formatExactAmount(x: number): string | undefined {
  return showsInFull(x, 1) ? undefined : formatExact(x);
}

/** The full value of a count, such as 958.4 behind 958, if a compact figure hides one */
export function formatExactCount(x: number): string | undefined {
  return showsInFull(x, 0) ? undefined : formatExact(x);
}

/** The full value of a ratio from 0 to 1, such as 73.21% behind 73.2%, if a compact figure hides one */
export function formatExactPercent(ratio: number): string | undefined {
  return showsInFull(ratio * 100, 1) ? undefined : exactPercentFormatter.format(ratio);
}
