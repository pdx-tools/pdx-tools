/**
 * Where each save's stroke stands in a strip of a given width.
 *
 * Strokes stand at their saves' dates. They never touch: where two saves
 * are closer than a stroke and a one-pixel gap, the later one moves right
 * just enough. When even one-pixel strokes cannot all fit apart, the strip
 * shows the run of saves around the selected one that fits, at their dates.
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
  /** Beads of another country fit between strokes without touching. */
  beads: boolean;
};

const PAD = 3;

export function stripGeometry(
  days: readonly number[],
  width: number,
  selected: number,
): StripGeometry {
  const n = days.length;
  const span = Math.max(1, width - PAD * 2);
  // A typical gap sets the stroke's width; a lone save gets the widest.
  const gaps = days
    .slice(1)
    .map((day, i) => day - days[i])
    .sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const whole = n > 1 ? days[n - 1] - days[0] : 0;
  const pitch = whole > 0 ? (median / whole) * span : span;
  const bar = pitch >= 12 ? 3 : pitch >= 4.5 ? 2 : pitch >= 2.5 ? 1.5 : 1;
  const step = bar + 1;
  // How many saves fit apart; beyond that the strip shows a run of them.
  const fits = Math.max(1, Math.floor((span - bar) / step) + 1);
  const count = Math.min(n, fits);
  const first = Math.max(0, Math.min(n - count, selected - Math.floor(count / 2)));
  const last = first + count - 1;
  const from = days[first] ?? 0;
  const to = days[last] ?? 0;
  const xDay = (day: number) =>
    to > from ? PAD + ((day - from) / (to - from)) * (span - bar) : PAD + (span - bar) / 2;
  const x = days.map(() => NaN);
  for (let i = first; i <= last; i++) x[i] = xDay(days[i]);
  // Apart from the left, then back from the right edge.
  for (let i = first + 1; i <= last; i++) x[i] = Math.max(x[i], x[i - 1] + step);
  x[last] = Math.min(x[last], PAD + span - bar);
  for (let i = last - 1; i >= first; i--) x[i] = Math.min(x[i], x[i + 1] - step);
  for (let i = first; i <= last; i++) x[i] = Math.round(x[i] * 2) / 2;
  let closest = Infinity;
  for (let i = first + 1; i <= last; i++) closest = Math.min(closest, x[i] - x[i - 1]);
  return { width, bar, first, last, x, from, to, xDay, beads: closest >= 4 };
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
