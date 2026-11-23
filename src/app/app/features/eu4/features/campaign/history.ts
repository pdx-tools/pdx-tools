import type { Lineage, LineageCell } from "@/wasm/wasm_eu4";
import { lineageKey } from "./model";

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
 * Round ticks at most about five steps apart over the values. A full scale
 * always shows zero: it starts at zero, or under a negative smallest value,
 * and ends at zero when every value is negative. A fitted scale starts at a
 * round step under the smallest value. Each end leaves 3% room past the
 * values, so no mark touches the plot's edge.
 */
export function valueScale(min: number, max: number, zero: boolean): ValueScale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  const bottom = min < 0 ? min - Math.abs(min) * 0.03 : min;
  const lo0 = zero ? Math.min(0, bottom) : min;
  const hi0 = zero ? Math.max(0, max) : max;
  const top = hi0 + Math.max(Math.abs(hi0) * 0.03, 1e-9);
  const span = Math.max(top - lo0, zero ? 1 : Math.abs(max) * 0.02 || 1);
  const power = 10 ** Math.floor(Math.log10(span / 4));
  const step =
    [1, 2, 2.5, 5, 10, 20].map((m) => m * power).find((s) => span / s <= 5.01) ?? 20 * power;
  const lo = Math.floor(lo0 / step + 1e-9) * step;
  const hi = Math.ceil(top / step - 1e-9) * step || 0;
  const ticks: number[] = [];
  for (let at = lo; at <= hi + step / 2; at += step) ticks.push(Number(at.toPrecision(12)) || 0);
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

/**
 * What a standings row's rank cell holds: a rank ("3", "=3"), or for a row
 * from outside the filter, that it is a rival of the followed country or the
 * followed country itself, neither ranked.
 */
export type RankPlace = { kind: "rank"; text: string } | { kind: "rival" } | { kind: "outside" };

/** A standings row in value order, with what its rank cell holds. */
export type PlacedStanding<R extends LineRow = LineRow> = {
  row: R;
  value: number;
  place: RankPlace;
};

/**
 * The ranked rows and those from outside the filter in one value order. Only
 * the filter's rows have ranks, so they run 1..n with no gap; a row from
 * outside stands by its value with none. Ties keep the ranked row first.
 */
export function placeStandings<R extends LineRow>(
  ranked: readonly Standing<R>[],
  unranked: readonly Standing<R>[],
  subject: string | null,
  rivalKeys?: ReadonlySet<string>,
): PlacedStanding<R>[] {
  // The chart keeps a row from outside the filter only as a rival or as the followed country.
  const outsidePlace = (key: string): RankPlace =>
    rivalKeys?.has(key) && key !== subject ? { kind: "rival" } : { kind: "outside" };
  return [
    ...ranked.map((x): PlacedStanding<R> => ({
      row: x.row,
      value: x.value,
      place: { kind: "rank", text: `${x.tied ? "=" : ""}${x.rank}` },
    })),
    ...unranked.map((x): PlacedStanding<R> => ({
      row: x.row,
      value: x.value,
      place: outsidePlace(x.row.key),
    })),
  ].sort((a, b) => b.value - a.value);
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

/** Which countries the chart draws in color: the top five and players, or the subject and its rivals. */
export type ColorMode = "top" | "rivals";

/**
 * The countries the chart asks for with the rivals rule: the filter's, and
 * the rivals, at any save, of the played lineages and of the followed one.
 * The chart then keeps only the rivals at the selected save.
 */
export function withRivals(
  filter: readonly string[],
  answer: readonly {
    lineage: Pick<Lineage, "tags">;
    values: readonly (readonly string[] | null | undefined)[];
    played: boolean;
  }[],
  followed: string | null,
): string[] {
  // A stored key can be older than a tag switch that a newer save adds.
  const keys = answer.map((x) => ({ key: lineageKey(x.lineage) }));
  const found = findKey(keys, followed);
  const rivals = answer.flatMap((x, i) =>
    x.played || keys[i].key === found ? x.values.flatMap((tags) => tags ?? []) : [],
  );
  return [...new Set([...filter, ...rivals])];
}

/**
 * A tag that the game makes for a new country and gives to another later,
 * such as a colonial nation (C00): no lineage follows it, as the analysis
 * leaves it out of every series.
 */
export const isGeneratedTag = (tag: string) => /^[CEFKT]\d\d$/.test(tag);

/**
 * The rows the chart keeps: the filter's, and a country from outside it only
 * while it is the followed one or one of its rivals at the selected save.
 * Those from outside are `added`: drawn, but not ranked. The world total
 * (no filter) keeps every row.
 */
export function keepRivals<R extends LineRow & { lineage: Pick<Lineage, "tags"> | null }>(
  rows: readonly R[],
  filter: readonly string[] | null,
  rivalKeys: ReadonlySet<string>,
  followed: string | null,
): { chartRows: readonly R[]; added: Set<string> } {
  if (!filter) return { chartRows: rows, added: new Set() };
  const inFilter = new Set(filter);
  const outside = (row: R) => !row.lineage?.tags.some((held) => inFilter.has(held.tag));
  const kept = rows.filter(
    (row) => !outside(row) || rivalKeys.has(row.key) || row.key === followed,
  );
  return { chartRows: kept, added: new Set(kept.filter(outside).map((row) => row.key)) };
}

/** The rows whose country, at a column, holds one of these rival tags. */
export function rivalRows<R extends LineRow>(
  rows: readonly R[],
  rivals: readonly string[] | null | undefined,
  column: number,
): Set<string> {
  const tags = new Set(rivals ?? []);
  return new Set(rows.flatMap((row) => (tags.has(row.cells[column]?.tag ?? "") ? [row.key] : [])));
}

/**
 * Which countries are drawn in their colors, and the rule in words. Up to
 * twelve shown, all are. Above that: the top five at the selected time, all
 * tied at fifth too, every country played in the campaign, the subject and
 * the pins. A country without a value then is not ranked. In single player
 * with a subject, the rivals rule replaces this: the subject, its rivals at
 * the selected time and the pins.
 */
export function colorRule<R extends LineRow>(
  rows: readonly R[],
  standings: readonly Standing<R>[],
  subject: string | null,
  pins: readonly string[],
  /** In single player, the subject and its rivals can be the rule. */
  rivals: { keys: ReadonlySet<string>; multiplayer: boolean } | null = null,
): { inColor: Set<string>; label: string | null } {
  const played = rows.filter((row) => row.played);
  // In multiplayer the players stay in color, as below.
  if (rivals && !rivals.multiplayer && subject) {
    const mine = rows.find((row) => row.key === subject);
    return {
      inColor: new Set([subject, ...rivals.keys, ...pins]),
      label: mine?.played ? "You and rivals" : "Followed and rivals",
    };
  }
  const players = played.length > 1 && played.length === rows.length;
  if (rows.length <= ALL_IN_COLOR) {
    return {
      inColor: new Set(rows.map((row) => row.key)),
      // With no rows there is no rule to name.
      label: !rows.length ? null : players ? "Players" : `All ${rows.length}`,
    };
  }
  if (players) return { inColor: new Set(rows.map((row) => row.key)), label: "Players" };
  const others = [...played.map((row) => row.key), ...(subject ? [subject] : []), ...pins];
  const colored = (top: readonly Standing<R>[]) =>
    new Set([...top.map((x) => x.row.key), ...others]);
  // A tie at fifth comes in too, unless it would color more than a few, such as many at zero.
  let inColor = colored(standings.filter((x) => x.rank <= TOP));
  if (inColor.size > ALL_IN_COLOR) {
    const count = new Map<number, number>();
    for (const x of standings) count.set(x.value, (count.get(x.value) ?? 0) + 1);
    inColor = colored(standings.filter((x) => x.rank + count.get(x.value)! - 1 <= TOP));
  }
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
 * lead with their dots. A join is long, and dashed, when its gap is over
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
export function findKey(rows: readonly { key: string }[], key: string | null): string | null {
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

/** The days that the chart's axis spans: the read saves and those not read yet. */
export function axisBounds(
  days: readonly number[],
  pending: readonly { day: number }[] | null,
): [number, number] {
  const unread = (pending ?? []).map((x) => x.day);
  return [Math.min(days[0], ...unread), Math.max(days[days.length - 1], ...unread)];
}

/**
 * The view that a zoom asks for, made to hold at least one save and at least
 * the campaign's usual gap, inside the axis. A view of the whole axis is null.
 */
export function fitView(
  wanted: [number, number] | null,
  days: readonly number[],
  axis: readonly [number, number],
  median: number,
): [number, number] | null {
  let next = wanted;
  // A view holds at least one save: one that falls between saves widens to the nearest.
  if (next && !days.some((day) => day >= next![0] && day <= next![1])) {
    const middle = (next[0] + next[1]) / 2;
    const near = days.reduce((a, b) => (Math.abs(b - middle) < Math.abs(a - middle) ? b : a));
    next = [Math.min(next[0], near), Math.max(next[1], near)];
  }
  // A view is never narrower than the campaign's typical gap between saves.
  if (next) {
    const least = Math.max(median, 30);
    if (next[1] - next[0] < least) {
      // Widened about its middle, then moved back inside the axis.
      const middle = (next[0] + next[1]) / 2;
      const from = Math.max(axis[0], Math.min(axis[1] - least, middle - least / 2));
      next = [Math.round(from), Math.round(from + least)];
    }
  }
  return next && next[0] <= axis[0] && next[1] >= axis[1] ? null : next;
}
