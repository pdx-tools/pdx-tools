/**
 * Where each save's stroke stands in a strip of a given width.
 *
 * Strokes stand at their saves' dates. They never touch: where two saves
 * are closer than a stroke and a one-pixel gap, the later one moves right,
 * but never more than {@link MAX_SHIFT} pixels from its date, so no stroke
 * reaches another save's date. When the saves cannot all stand apart within
 * that, even at one pixel wide, the strip shows the longest run of saves
 * around the selected one that can.
 */
export type StripGeometry = {
  width: number;
  /** The width of one stroke. */
  bar: number;
  /** The first and last save that the strip shows. */
  first: number;
  last: number;
  /** The left edge of each save's stroke; NaN for a save outside the strip. */
  x: number[];
  /** The day at the strip's left and right edges, for the ruler. */
  from: number;
  to: number;
  /** The x of a day on the strip. */
  xDay: (day: number) => number;
  /** Beads of another country can stand between strokes; each still keeps a gap from the last. */
  beads: boolean;
};

const PAD = 3;
/** The farthest a stroke may stand from its date, in pixels. */
export const MAX_SHIFT = 2;

/** Strokes for saves first..last, or null when they cannot stand apart near their dates. */
function place(days: readonly number[], width: number, bar: number, first: number, last: number) {
  const span = Math.max(1, width - PAD * 2);
  const step = bar + 1;
  const from = days[first];
  const to = days[last];
  const xDay = (day: number) =>
    to > from ? PAD + ((day - from) / (to - from)) * (span - bar) : PAD + (span - bar) / 2;
  const x = days.map(() => NaN);
  for (let i = first; i <= last; i++) x[i] = xDay(days[i]);
  // Apart from the left, then back from the right edge.
  for (let i = first + 1; i <= last; i++) x[i] = Math.max(x[i], x[i - 1] + step);
  x[last] = Math.min(x[last], PAD + span - bar);
  for (let i = last - 1; i >= first; i--) x[i] = Math.min(x[i], x[i + 1] - step);
  for (let i = first; i <= last; i++) {
    if (x[i] < PAD - 0.01 || Math.abs(x[i] - xDay(days[i])) > MAX_SHIFT) return null;
    x[i] = Math.round(x[i] * 2) / 2;
  }
  return { x, from, to, xDay };
}

export function stripGeometry(
  days: readonly number[],
  width: number,
  selected: number,
): StripGeometry {
  const n = days.length;
  const span = Math.max(1, width - PAD * 2);
  // A typical gap sets the widest stroke to try; a lone save gets the widest.
  const gaps = days
    .slice(1)
    .map((day, i) => day - days[i])
    .sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const whole = n > 1 ? days[n - 1] - days[0] : 0;
  const pitch = whole > 0 ? (median / whole) * span : span;
  const bars = [3, 2, 1.5, 1].filter((bar) => bar === 1 || pitch >= bar * 4);
  const at = Math.max(0, Math.min(n - 1, selected));
  // The longest run around the selected save that stands apart, widest stroke first.
  for (let count = n; count >= 1; count = count > 8 ? Math.floor(count * 0.9) : count - 1) {
    const first = Math.max(0, Math.min(n - count, at - Math.floor(count / 2)));
    const last = first + count - 1;
    for (const bar of bars) {
      const placed = n ? place(days, width, bar, first, last) : null;
      if (!placed) continue;
      // At one-pixel strokes the saves are too close for beads beside them.
      return { width, bar, first, last, ...placed, beads: bar > 1 };
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
    beads: false,
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

/** One reference line for every row: the round figure nearest the middle of the scale. */
export function referenceValue(max: number): number {
  if (!(max > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(max / 2));
  return [1, 2, 2.5, 5, 10]
    .map((m) => m * magnitude)
    .reduce((a, b) => (Math.abs(b - max * 0.55) < Math.abs(a - max * 0.55) ? b : a));
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
