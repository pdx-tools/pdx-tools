const floatFormatters = Array.from(
  { length: 5 },
  (_, n) =>
    new Intl.NumberFormat(undefined, {
      minimumFractionDigits: n,
      maximumFractionDigits: n,
    }),
);

const intFormatter = floatFormatters[0];

export function formatInt(x: number) {
  return intFormatter.format(x);
}

export function abbreviateInt(x: number) {
  if (x < 1000) {
    return formatInt(x);
  } else if (x < 1000000) {
    return `${formatInt(x / 1000)}K`;
  } else {
    return `${formatFloat(x / 1000000, 2)}M`;
  }
}

export function formatCompact(x: number, precision = 1): string {
  const abs = Math.abs(x);
  const sign = x < 0 ? "−" : "";
  if (abs < 1000) return formatFloat(x, precision);
  if (abs < 1_000_000) return `${sign}${formatFloat(abs / 1000, 1)}K`;
  return `${sign}${formatFloat(abs / 1_000_000, 2)}M`;
}

export function formatFloat(x: number, precision?: number) {
  return floatFormatters[precision ?? 3].format(x);
}

const COMPACT_UNITS = [
  { size: 1_000_000_000, suffix: "B" },
  { size: 1_000_000, suffix: "M" },
  { size: 1_000, suffix: "K" },
] as const;

/**
 * An amount in a list, a table, or a stat line: one decimal, and a unit when the
 * value is 1,000 or more, for example 72.2, 958.0, 14.3K, 9.1K, 22.9M. The decimal
 * column lines up in each list and in each view of one metric. Exact values stay
 * in a tooltip.
 */
export function formatMetric(x: number): string {
  const sign = x < 0 ? "\u2212" : "";
  const abs = Math.abs(x);
  if (abs === 0) return "0.0";
  // A value that rounds to zero is not zero, so it does not read "0.0".
  if (abs < 0.05) return `${sign}<0.1`;
  // A unit starts where the value rounds to 1,000 of the unit under it, so 999.96 is 1.0K.
  const unit = COMPACT_UNITS.find((u) => Number(((abs * 1000) / u.size).toFixed(1)) >= 1000);
  return `${sign}${formatFloat(abs / (unit?.size ?? 1), 1)}${unit?.suffix ?? ""}`;
}

/**
 * A value in the unit of the largest value that it stands beside, so that values of
 * a similar size read in one unit (0.9K beside 1.6K, and not 877.8 beside 1.6K). A long
 * tail keeps its own forms: 387.0K beside 21.7M is exact, and 0.4M is not.
 */
export function formatCompactIn(x: number, largest: number, own = formatMetric(x)): string {
  const unit = COMPACT_UNITS.find(
    (u) => Number(((Math.abs(largest) * 1000) / u.size).toFixed(1)) >= 1000,
  );
  const abs = Math.abs(x);
  if (!unit || abs >= unit.size || abs / unit.size < 0.1 || Math.abs(largest) / unit.size >= 10) {
    return own;
  }
  return `${x < 0 ? "\u2212" : ""}${formatFloat(abs / unit.size, 1)}${unit.suffix}`;
}

const tickFormatter = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 });

/**
 * A tick on a chart's axis: the form of `formatMetric` with no zeros at the
 * end, because a tick is a round number. For example 0.5, 20, 5K, 10M.
 */
export function formatTick(x: number): string {
  const abs = Math.abs(x);
  const unit = COMPACT_UNITS.find((u) => abs >= u.size);
  const text = tickFormatter.format(unit ? abs / unit.size : abs);
  return `${x < 0 ? "\u2212" : ""}${text}${unit?.suffix ?? ""}`;
}

/** A count: an integer under 1,000 (no 958.0), then the form of `formatMetric` */
export function formatCount(x: number): string {
  const rounded = Math.round(x);
  if (Math.abs(rounded) >= 1_000) return formatMetric(x);
  return `${rounded < 0 ? "\u2212" : ""}${formatInt(Math.abs(rounded))}`;
}

/** A level that the game can give as a whole number: 17 stays 17, and a mean is 16.5 */
export function formatLevel(x: number): string {
  return Number.isInteger(x) ? formatCount(x) : formatMetric(x);
}

/** A fixed scale, such as stability: one decimal for each value, so that a row has one form */
export function formatScale(x: number): string {
  return `${x < 0 ? "\u2212" : ""}${formatFloat(Math.abs(x), 1)}`;
}

/**
 * A share or a ratio from 0 to 1 as a percent: one decimal in each list and each
 * chart, and "<0.1%" as the floor of a share that is not zero.
 */
export function formatPercent(ratio: number): string {
  return formatFixedPercent(ratio);
}

/** A yearly rate, such as growth: two decimals, because its values are small. Each view has this form. */
export function formatRate(ratio: number): string {
  const percent = ratio * 100;
  return `${percent < 0 ? "\u2212" : percent > 0 ? "+" : ""}${formatFloat(Math.abs(percent), 2)}%`;
}

const exactFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/**
 * The full value behind a compact figure, such as 12,073.9 behind 12.1K. A
 * tooltip shows it, so a reader can ask why a number is what it is.
 */
export function formatExact(x: number): string {
  return `${x < 0 ? "\u2212" : ""}${exactFormatter.format(Math.abs(x))}`;
}

/** True if a figure of one decimal, with no unit, loses nothing of `formatExact` */
export function showsInFull(x: number): boolean {
  const rounded = Number(x.toFixed(2));
  return Math.abs(rounded) < 1000 && Number(rounded.toFixed(1)) === rounded;
}

/** The full value of a ratio from 0 to 1, such as 73.21% behind 73.2%, if a compact figure hides one */
export function formatExactPercent(ratio: number): string | undefined {
  const percent = ratio * 100;
  return showsInFull(percent) ? undefined : `${formatExact(percent)}%`;
}

export function sentenceCasing(x: string): string {
  return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
}

export const pluralize = (noun: string, count: number, suffix = "s") =>
  `${formatInt(count)} ${noun}${count !== 1 ? suffix : ""}`;

const listFormatLong = new Intl.ListFormat(undefined, {
  style: "long",
  type: "conjunction",
});
const listFormatShort = new Intl.ListFormat(undefined, {
  style: "short",
  type: "conjunction",
});

type FormatListOptions = {
  style?: "long" | "short";
};

export function formatList(x: string[], options?: Partial<FormatListOptions>): string {
  if (x.length === 0) {
    return "(None)";
  }

  if (options?.style === "short") {
    return listFormatShort.format(x);
  } else {
    return listFormatLong.format(x);
  }
}

/**
 * An amount in one column of a sortable table: a fixed number of decimals, so
 * that the place values align down the column. A narrow list uses `formatMetric`.
 */
export function formatFixed(x: number, digits: number): string {
  const sign = x < 0 && Number(Math.abs(x).toFixed(digits)) !== 0 ? "−" : "";
  return `${sign}${formatFloat(Math.abs(x), digits)}`;
}

/**
 * A ratio from 0 to 1 as a percent with one decimal, for a share or a column of
 * a table. A very small share that is not zero reads "<0.1%" and never "0.0%".
 */
export function formatFixedPercent(ratio: number): string {
  const percent = ratio * 100;
  if (percent > 0 && percent < 0.1) return "<0.1%";
  return `${formatFixed(percent, 1)}%`;
}
