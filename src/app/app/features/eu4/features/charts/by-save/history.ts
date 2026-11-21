import type { LineageCell } from "@/wasm/wasm_eu4";

/**
 * The rules of the history chart that do not draw anything: its value scale,
 * the standings at a time, where rows stand beside the plot, which countries
 * are in color, how long two countries have stood in their order, and the
 * subject and pins that the reader chooses.
 */

/** A row of the chart: one country over time, a cell per time, null where it has none. */
export type LineRow = {
  key: string;
  cells: readonly (LineageCell | null)[];
  /** A save says the country was played at some point in the campaign. */
  played: boolean;
};

/** The number in a cell, or null without one; a country without a record has none. */
export function valueOf(cell: LineageCell | null | undefined): number | null {
  return cell?.kind === "value" ? cell.value : null;
}

export type ValueScale = { lo: number; hi: number; ticks: number[] };

/**
 * Round ticks at most about five steps apart over the values. A zero-based
 * scale starts at zero; a fitted one at a round step under the smallest
 * value. The top is the first tick at least 3% above the largest value, so
 * no mark touches the plot's edge.
 */
export function valueScale(min: number, max: number, zero: boolean): ValueScale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  const lo0 = zero ? Math.min(0, min) : min;
  const top = max + Math.max(Math.abs(max) * 0.03, 1e-9);
  const span = Math.max(top - lo0, zero ? 1 : Math.abs(max) * 0.02 || 1);
  const power = 10 ** Math.floor(Math.log10(span / 4));
  const step =
    [1, 2, 2.5, 5, 10, 20].map((m) => m * power).find((s) => span / s <= 5.01) ?? 20 * power;
  const lo = Math.floor(lo0 / step + 1e-9) * step;
  const hi = Math.ceil(top / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let at = lo; at <= hi + step / 2; at += step) ticks.push(Number(at.toPrecision(12)));
  return { lo, hi, ticks };
}

export type Standing<R extends LineRow = LineRow> = {
  row: R;
  value: number;
  /** One more than the number of countries strictly ahead. */
  rank: number;
  /** Another country has the same value. */
  tied: boolean;
};

/**
 * The countries with a value at a column, largest first. Equal values share
 * a rank and keep the rows' order. A country without a value there, or
 * whose save has no record of it, has no rank.
 */
export function standingsAt<R extends LineRow>(rows: readonly R[], column: number): Standing<R>[] {
  const list = rows.flatMap((row, index) => {
    const value = valueOf(row.cells[column]);
    return value === null ? [] : [{ row, value, index }];
  });
  list.sort((a, b) => b.value - a.value || a.index - b.index);
  return list.map(({ row, value }, i) => {
    let rank = i;
    while (rank > 0 && list[rank - 1].value === value) rank--;
    const tied = (list[i - 1]?.value ?? NaN) === value || (list[i + 1]?.value ?? NaN) === value;
    return { row, value, rank: rank + 1, tied };
  });
}

export type Absence<R extends LineRow = LineRow> = {
  row: R;
  /** Why there is no figure: the last and next columns with one. */
  note:
    | { kind: "noRecord" }
    | { kind: "until"; column: number }
    | { kind: "from"; column: number }
    | { kind: "between"; until: number; from: number };
  /** The column whose tag names the country. */
  column: number;
};

/** The countries with a value elsewhere but none at a column, and why. */
export function absentAt<R extends LineRow>(rows: readonly R[], column: number): Absence<R>[] {
  return rows.flatMap((row): Absence<R>[] => {
    if (valueOf(row.cells[column]) !== null) return [];
    let before = -1;
    for (let i = column - 1; i >= 0; i--) {
      if (valueOf(row.cells[i]) !== null) {
        before = i;
        break;
      }
    }
    let after = -1;
    for (let i = column + 1; i < row.cells.length; i++) {
      if (valueOf(row.cells[i]) !== null) {
        after = i;
        break;
      }
    }
    if (before < 0 && after < 0) return [];
    if (row.cells[column]?.kind === "noRecord")
      return [{ row, note: { kind: "noRecord" }, column }];
    const note =
      before >= 0 && after >= 0
        ? ({ kind: "between", until: before, from: after } as const)
        : before >= 0
          ? ({ kind: "until", column: before } as const)
          : ({ kind: "from", column: after } as const);
    return [{ row, note, column: before >= 0 ? before : after }];
  });
}

/**
 * Tops for items that want to be centered on a height, in order, pushed
 * apart only as far as they must not to overlap, and kept within the
 * bounds where they fit. Returns the tops and the largest push.
 */
export function placeRows(
  items: readonly { want: number; height: number }[],
  top: number,
  bottom: number,
): { tops: number[]; push: number } {
  type Block = { first: number; count: number; top: number; height: number; sum: number };
  const blocks: Block[] = [];
  items.forEach((item, i) => {
    const start = item.want - item.height / 2;
    let block: Block = { first: i, count: 1, top: start, height: item.height, sum: start };
    // Merge back while a block overlaps the one before it; a block's top is its items' mean wish.
    for (;;) {
      block.top = Math.max(top, Math.min(bottom - block.height, block.top));
      const prev = blocks.at(-1);
      if (!prev || prev.top + prev.height <= block.top + 1e-9) break;
      blocks.pop();
      const sum = prev.sum + block.sum - prev.height * block.count;
      const count = prev.count + block.count;
      block = {
        first: prev.first,
        count,
        top: sum / count,
        height: prev.height + block.height,
        sum,
      };
    }
    blocks.push(block);
  });
  const tops: number[] = [];
  for (const block of blocks) {
    let at = block.top;
    for (let i = block.first; i < block.first + block.count; i++) {
      tops.push(at);
      at += items[i].height;
    }
  }
  const push = Math.max(
    0,
    ...items.map((item, i) => Math.abs(tops[i] + item.height / 2 - item.want)),
  );
  return { tops, push };
}

/** Above this many countries, only some are in color. */
export const ALL_IN_COLOR = 12;
const TOP = 5;

/**
 * Which countries are drawn in their colors, and the rule in words. Up to
 * twelve shown, all are. Above that: the top five at the selected time, all
 * tied at fifth too, every country played in the campaign, the subject and
 * the pins. A country without a value then is not ranked.
 */
export function colorRule<R extends LineRow>(
  rows: readonly R[],
  standings: readonly Standing<R>[],
  subject: string | null,
  pins: readonly string[],
): { inColor: Set<string>; label: string | null } {
  const played = rows.filter((row) => row.played);
  const players = played.length > 1 && played.length === rows.length;
  if (rows.length <= ALL_IN_COLOR) {
    return { inColor: new Set(rows.map((row) => row.key)), label: players ? "Players" : null };
  }
  if (players) return { inColor: new Set(rows.map((row) => row.key)), label: "Players" };
  const inColor = new Set<string>();
  for (const standing of standings) if (standing.rank <= TOP) inColor.add(standing.row.key);
  for (const row of played) inColor.add(row.key);
  if (subject) inColor.add(subject);
  for (const pin of pins) inColor.add(pin);
  const label =
    played.length > 1 ? "Top 5 and players" : played.length ? "Top 5 and player" : "Top 5";
  return { inColor, label };
}

export type Order = {
  /** 1: the subject is ahead, -1: behind, 0: level. */
  sign: number;
  /** The first column of the run in which the two have stood in this order. */
  since: number;
  /** The run reaches back to the first column where both have values. */
  whole: boolean;
};

/** How long two countries have stood in their present order, looking back from a column. */
export function orderSince(
  subject: readonly (LineageCell | null)[],
  rival: readonly (LineageCell | null)[],
  column: number,
): Order | null {
  const a = valueOf(subject[column]);
  const b = valueOf(rival[column]);
  if (a === null || b === null) return null;
  const sign = Math.sign(a - b);
  let since = column;
  for (; since > 0; since--) {
    const x = valueOf(subject[since - 1]);
    const y = valueOf(rival[since - 1]);
    if (x === null || y === null) return { sign, since, whole: true };
    if (Math.sign(x - y) !== sign) return { sign, since, whole: false };
  }
  return { sign, since, whole: true };
}

const YEAR = 365;

/**
 * How the saves sit in time. Sparse saves, a median gap over five years,
 * lead with their dots. A join is long, and dotted, when its gap is over
 * five years or over 2.5 times the median.
 */
export function saveSpacing(days: readonly number[]) {
  const gaps = days
    .slice(1)
    .map((day, i) => day - days[i])
    .sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const sparse = median > 5 * YEAR;
  // Over five years between saves is not a measured trend, whatever the campaign's spacing.
  const long = (gap: number) =>
    gaps.length > 0 && (gap > 5 * YEAR || (gaps.length > 1 && gap > median * 2.5));
  return { median, sparse, long };
}

/**
 * The save years to label on the time axis, as x positions in pixels: the
 * selected save first, then the others from the ends inward, each kept only
 * if it stands clear of those already kept.
 */
export function saveYearLabels(
  xs: readonly number[],
  selected: number,
  clearance: number,
): number[] {
  const order = [selected, 0, xs.length - 1];
  for (let i = 1; i < xs.length - 1; i++) order.push(i);
  const kept: number[] = [];
  for (const i of order) {
    if (i < 0 || i >= xs.length || kept.includes(i)) continue;
    if (kept.every((k) => Math.abs(xs[k] - xs[i]) >= clearance)) kept.push(i);
  }
  return kept.sort((a, b) => a - b);
}

/** The subject and the held comparisons that the reader chose. */
export type Focus = {
  /** The chosen subject; null with `released` means none by choice. */
  subject: string | null;
  released: boolean;
  pins: string[];
};

export const NO_FOCUS: Focus = { subject: null, released: false, pins: [] };
const MOST_PINS = 3;

/**
 * The shown row of a stored lineage key. A newer save can extend a lineage
 * with a tag switch, so a key also finds the one row that extends it or
 * that it extends.
 */
export function findKey(rows: readonly LineRow[], key: string | null): string | null {
  if (!key) return null;
  if (rows.some((row) => row.key === key)) return key;
  const near = rows.filter((row) => row.key.startsWith(`${key}>`) || key.startsWith(`${row.key}>`));
  return near.length === 1 ? near[0].key : null;
}

/**
 * The one country played in a single-player campaign. A multiplayer
 * campaign has no default: its other players may be filtered out.
 */
export function defaultSubject(rows: readonly LineRow[], multiplayer: boolean): string | null {
  if (multiplayer) return null;
  const played = rows.filter((row) => row.played);
  return played.length === 1 ? played[0].key : null;
}

/** The subject in effect: the chosen one while it is shown, else the default unless released. */
export function subjectOf(
  focus: Focus,
  rows: readonly LineRow[],
  multiplayer: boolean,
): string | null {
  const chosen = findKey(rows, focus.subject);
  if (chosen) return chosen;
  return focus.released ? null : defaultSubject(rows, multiplayer);
}

/** The shown pins, by their rows' keys, without the subject. */
export function pinsOf(focus: Focus, rows: readonly LineRow[], subject: string | null): string[] {
  const keys = focus.pins.map((pin) => findKey(rows, pin));
  return keys.filter(
    (key, i): key is string => !!key && key !== subject && keys.indexOf(key) === i,
  );
}

/**
 * One gesture on a country. Without a subject it becomes the subject; with
 * one it is pinned or unpinned, up to three, the oldest giving way; the
 * subject itself releases the subject and the pins.
 */
export function pickCountry(
  focus: Focus,
  rows: readonly LineRow[],
  key: string,
  multiplayer: boolean,
): Focus {
  const subject = subjectOf(focus, rows, multiplayer);
  if (subject === key) return { subject: null, released: true, pins: [] };
  if (!subject) return { subject: key, released: false, pins: [] };
  const pins = pinsOf(focus, rows, subject);
  const next = pins.includes(key)
    ? pins.filter((pin) => pin !== key)
    : [...pins, key].slice(-MOST_PINS);
  return { ...focus, pins: next };
}

/** Escape: the pins go first, then the subject returns to its default. */
export function escapeFocus(focus: Focus): Focus {
  if (focus.pins.length) return { ...focus, pins: [] };
  if (focus.subject || focus.released) return NO_FOCUS;
  return focus;
}

/**
 * Each value as text, coarse unless two different values would read the
 * same: those get the fine text, so figures that rank apart never read
 * alike and no figure shows a decimal it does not need.
 */
export function distinctTexts(
  values: readonly (number | null)[],
  coarse: (value: number) => string,
  fine: (value: number, digits: number) => string,
): string[] {
  const texts = values.map((value) => (value === null ? "" : coarse(value)));
  const clashes = (i: number, all: readonly string[]) =>
    values.some(
      (other, k) => k !== i && other !== null && other !== values[i] && all[k] === all[i],
    );
  // More digits, up to three, only for figures that still read alike.
  for (let digits = 1; digits <= 3; digits++) {
    const next = texts.map((text, i) =>
      values[i] !== null && clashes(i, texts) ? fine(values[i]!, digits) : text,
    );
    if (next.every((text, i) => text === texts[i])) break;
    next.forEach((text, i) => (texts[i] = text));
  }
  return texts;
}
