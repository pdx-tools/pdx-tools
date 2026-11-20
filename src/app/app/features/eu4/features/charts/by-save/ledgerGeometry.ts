/**
 * Where each save's stroke stands in a strip of a given width.
 *
 * Every stroke has the same whole-pixel width and stands on a whole pixel,
 * so no stroke looks heavier than another. Strokes stand at their saves'
 * dates and never touch: where two saves are closer than a stroke and a
 * one-pixel gap, the later one moves right, but never more than
 * {@link MAX_SHIFT} pixels from its date, so no stroke reaches another
 * save's date. When the saves cannot all stand apart within that, even at
 * one pixel wide, the strip shows the longest run of saves around the
 * selected one that can.
 */
export type StripGeometry = {
  width: number;
  /** The width of every stroke, in whole pixels. */
  bar: number;
  /** The first and last save that the strip shows. */
  first: number;
  last: number;
  /** The left edge of each save's stroke, a whole pixel; NaN for a save outside the strip. */
  x: number[];
  /** The day at the strip's left and right edges, for the ruler. */
  from: number;
  to: number;
  /** The x of a day on the strip. */
  xDay: (day: number) => number;
};

const PAD = 3;
/** The farthest a stroke may stand from its date, in pixels. */
export const MAX_SHIFT = 2;
/** The widest stroke: a stroke takes up to two fifths of the pitch, never more than this. */
const WIDEST = 4;

/**
 * Strokes for saves first..last, or null when they cannot stand apart near
 * their dates. Each stroke may stand anywhere within {@link MAX_SHIFT} whole
 * pixels of its date; placing each as far left as its window and the one
 * before allow finds a fit whenever there is one.
 */
function place(days: readonly number[], width: number, bar: number, first: number, last: number) {
  const span = Math.max(1, Math.floor(width) - PAD * 2);
  const step = bar + 1;
  const from = days[first];
  const to = days[last];
  const xDay = (day: number) =>
    to > from ? PAD + ((day - from) / (to - from)) * (span - bar) : PAD + (span - bar) / 2;
  const right = PAD + span - bar;
  const x = days.map(() => NaN);
  for (let i = first; i <= last; i++) {
    const at = xDay(days[i]);
    const lo = Math.max(PAD, Math.ceil(at - MAX_SHIFT));
    const hi = Math.min(right, Math.floor(at + MAX_SHIFT));
    const next = i === first ? lo : Math.max(lo, x[i - 1] + step);
    if (next > hi) return null;
    x[i] = next;
  }
  // Each stroke back toward its date where the next one leaves room.
  for (let i = last; i >= first; i--) {
    const at = Math.round(xDay(days[i]));
    const ceiling = i === last ? right : x[i + 1] - step;
    if (x[i] < at) x[i] = Math.min(at, ceiling);
  }
  return { x, from, to, xDay };
}

export function stripGeometry(
  days: readonly number[],
  width: number,
  selected: number,
): StripGeometry {
  const n = days.length;
  const span = Math.max(1, Math.floor(width) - PAD * 2);
  // A typical gap sets the widest stroke to try; a lone save gets the widest.
  const gaps = days
    .slice(1)
    .map((day, i) => day - days[i])
    .sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const whole = n > 1 ? days[n - 1] - days[0] : 0;
  const pitch = whole > 0 ? (median / whole) * span : span;
  const widest = Math.max(1, Math.min(WIDEST, Math.floor(pitch / 2.5)));
  const bars = Array.from({ length: widest }, (_, i) => widest - i);
  const at = Math.max(0, Math.min(n - 1, selected));
  // The longest run around the selected save that stands apart, widest stroke first.
  for (let count = n; count >= 1; count = count > 8 ? Math.floor(count * 0.9) : count - 1) {
    const first = Math.max(0, Math.min(n - count, at - Math.floor(count / 2)));
    const last = first + count - 1;
    for (const bar of bars) {
      const placed = n ? place(days, width, bar, first, last) : null;
      if (placed) return { width, bar, first, last, ...placed };
    }
  }
  return {
    width,
    bar: 1,
    first: 0,
    last: -1,
    x: days.map(() => NaN),
    from: 0,
    to: 0,
    xDay: () => PAD,
  };
}

/** The nearest shown save to an x on the strip. */
export function nearestSave(geometry: StripGeometry, px: number): number | null {
  let best: number | null = null;
  let distance = Infinity;
  for (let i = geometry.first; i <= geometry.last; i++) {
    const gap = Math.abs(geometry.x[i] + geometry.bar / 2 - px);
    if (gap < distance) {
      distance = gap;
      best = i;
    }
  }
  return best;
}

/** The smallest round figure at or above a value: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten. */
function roundUp(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step =
    [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * magnitude >= value - 1e-9) ?? 10;
  return step * magnitude;
}

/** One reference line for every row: the round figure nearest the middle of the scale. */
export function referenceValue(max: number): number {
  if (!(max > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(max / 2));
  return [1, 2, 2.5, 5, 10]
    .map((m) => m * magnitude)
    .reduce((a, b) => (Math.abs(b - max * 0.55) < Math.abs(a - max * 0.55) ? b : a));
}

/**
 * The zero-based scale that every country row shares: its top is a round
 * figure at least 5% above the largest value in view, so no stroke reaches
 * the row's edge, and a reference line about halfway.
 */
export function countryScale(max: number): { lo: number; hi: number; refs: number[] } {
  if (!(max > 0)) return { lo: 0, hi: 1, refs: [] };
  const hi = roundUp(max * 1.05);
  return { lo: 0, hi, refs: [referenceValue(hi), hi] };
}

/** A fitted scale for one series: round steps around its values, with headroom. */
export function fittedScale(values: readonly number[]): {
  lo: number;
  hi: number;
  steps: number[];
} {
  if (!values.length) return { lo: 0, hi: 1, steps: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const raw = Math.max((max - min) / 4, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((m) => m >= raw) ?? raw;
  const lo = Math.floor(min / unit) * unit;
  const hi = Math.ceil(max / unit) * unit + (Math.ceil(max / unit) * unit === max ? unit : 0);
  const steps: number[] = [];
  for (let at = lo; at <= hi + unit / 2; at += unit) steps.push(at);
  return { lo, hi, steps };
}

/** Relative luminance of a hex color. */
function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return 0.5;
  const [r, g, b] = match
    .slice(1)
    .map((part) => parseInt(part, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A game color that would vanish into the ground gets a thin rim; the fill
 * itself is never changed.
 */
export function needsRim(hex: string, dark: boolean): boolean {
  const a = luminance(hex);
  const ground = dark ? luminance("#0f172a") : 1;
  const ratio = (Math.max(a, ground) + 0.05) / (Math.min(a, ground) + 0.05);
  return ratio < (dark ? 3 : 1.35);
}
