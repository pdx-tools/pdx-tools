import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dayNumber, parseDate } from "@/features/timeline/date";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import {
  absentAt,
  colorRule,
  distinctTexts,
  escapeFocus,
  findKey,
  orderSince,
  pickCountry,
  pinsOf,
  standingsAt,
  subjectOf,
  valueOf,
} from "./history";
import type { Absence } from "./history";
import type { ChartLine, Comparison, LineRole } from "./historyOption";
import { heldIndex } from "./model";
import type { BySaveRow, CountryInfo } from "./model";
import type { StandingRow } from "./Standings";
import { setFocus, useBySaveView, useFocus } from "./view";

export const nameOf = (names: ReadonlyMap<string, CountryInfo>, tag: string) =>
  names.get(tag)?.name ?? tag;

/** "was Castile", "was Viti and 32 earlier", or "later Spain". */
function heldNote(row: BySaveRow, column: number, names: ReadonlyMap<string, CountryInfo>) {
  const tags = row.lineage?.tags ?? [];
  const k = heldIndex(row, column);
  if (k === null || tags.length < 2) return null;
  if (k > 0) return `was ${nameOf(names, tags[k - 1].tag)}${k > 1 ? ` and ${k - 1} earlier` : ""}`;
  return `later ${nameOf(names, tags[tags.length - 1].tag)}`;
}

/** Every tag of a country with when it held it, for the row's title and assistive tech. */
function lineageText(row: BySaveRow, names: ReadonlyMap<string, CountryInfo>) {
  const tags = row.lineage?.tags ?? [];
  if (tags.length < 2) return "";
  return tags
    .map((held) => {
      const from = held.from ? ` from ${held.from.slice(0, 4)}` : "";
      const until = held.until ? ` until ${held.until.slice(0, 4)}` : "";
      return `${nameOf(names, held.tag)}${from}${until}`;
    })
    .join(", ");
}

export type HistoryModelInput = {
  playthroughId: string | null;
  rows: readonly BySaveRow[];
  columns: readonly AnalysisSave[];
  names: ReadonlyMap<string, CountryInfo>;
  world: boolean;
  selected: number;
  multiplayer: boolean;
  format: (value: number) => string;
  fine: (value: number, digits: number) => string;
};

/**
 * What the history chart shows of a campaign figure, apart from drawing:
 * the followed country and pins the reader chose, the country pointed at,
 * the lines with their roles, the standings and countries without a
 * figure, the comparison, and the color rule. Pointing changes only the
 * pointed key and the comparison, never the lines' roles.
 */
export function useHistoryModel({
  playthroughId,
  rows,
  columns,
  names,
  world,
  selected,
  multiplayer,
  format,
  fine,
}: HistoryModelInput) {
  const focus = useFocus(playthroughId);
  // Other players of a multiplayer campaign may be filtered out, so none is followed by default.
  const subject = world ? null : subjectOf(focus, rows, multiplayer);
  const pins = useMemo(() => pinsOf(focus, rows, subject), [focus, rows, subject]);
  // The country under the pointer, and the one with keyboard focus: the pointer's wins while it lasts.
  const [pointerKey, setPointerKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const pointed = world ? null : (findKey(rows, pointerKey) ?? findKey(rows, focusKey));
  const compared = subject
    ? pointed && pointed !== subject
      ? pointed
      : (pins.at(-1) ?? null)
    : pointed;

  // Escape lets go of the pins, then of the subject.
  const escape = useRef<() => boolean>(() => false);
  useLayoutEffect(() => {
    escape.current = () => {
      const next = escapeFocus(focus);
      if (next === focus || !playthroughId) return false;
      setFocus(playthroughId, next);
      return true;
    };
  });
  const pick = (key: string) => {
    if (playthroughId) setFocus(playthroughId, pickCountry(focus, rows, key, multiplayer));
  };

  // Ties at the selected save list the subject first.
  const ranked = useMemo(
    () =>
      subject
        ? [...rows].sort((a, b) => Number(b.key === subject) - Number(a.key === subject))
        : rows,
    [rows, subject],
  );
  const standings = useMemo(
    () => (selected >= 0 && !world ? standingsAt(ranked, selected) : []),
    [ranked, selected, world],
  );
  const absent = useMemo(
    () => (selected >= 0 && !world ? absentAt(rows, selected) : []),
    [rows, selected, world],
  );
  // The color rule is the reader's choices; a pointed grey line is lit by the chart.
  const rule = useMemo(
    () => colorRule(rows, standings, subject, pins),
    [rows, standings, subject, pins],
  );
  useEffect(() => {
    useBySaveView.setState({ colorRule: world ? null : rule.label });
  }, [rule.label, world]);
  useEffect(() => () => useBySaveView.setState({ colorRule: null }), []);

  // How each line and row stands: followed, pinned, plain or grey, and whether it steps back.
  const roles = useMemo(() => {
    const emphasis = pins.length > 0;
    return new Map(
      rows.map((row) => {
        const role: LineRole = world
          ? "subject"
          : row.key === subject
            ? "subject"
            : pins.includes(row.key)
              ? "compared"
              : rule.inColor.has(row.key)
                ? "plain"
                : "grey";
        const back = emphasis && (role === "plain" || role === "grey");
        return [row.key, { role, back, pinned: pins.includes(row.key) }];
      }),
    );
  }, [rows, world, subject, pins, rule]);

  const lines = useMemo((): ChartLine[] => {
    const colorAt = (tag: string) => names.get(tag)?.color ?? "#808080";
    return rows.map((row) => ({
      key: row.key,
      values: row.cells.map(valueOf),
      colors: row.cells.map((cell) => (cell ? colorAt(cell.tag) : null)),
      names: row.cells.map((cell) => (cell ? nameOf(names, cell.tag) : null)),
      tags: row.cells.map((cell) => cell?.tag ?? null),
      changes: (row.lineage?.tags ?? []).flatMap((held) => {
        const from = held.from ? parseDate(held.from) : null;
        return from ? [{ day: dayNumber(from), color: colorAt(held.tag) }] : [];
      }),
      role: roles.get(row.key)!.role,
      back: roles.get(row.key)!.back,
    }));
  }, [rows, names, roles]);

  const comparison = useMemo((): Comparison | null => {
    if (!subject || !compared) return null;
    const a = lines.find((line) => line.key === subject);
    const b = lines.find((line) => line.key === compared);
    const subjectRow = rows.find((row) => row.key === subject);
    const rivalRow = rows.find((row) => row.key === compared);
    if (!a || !b || !subjectRow || !rivalRow) return null;
    const order = orderSince(subjectRow.cells, rivalRow.cells, selected);
    return { subject: a, rival: b, since: order && !order.whole ? order.since : null };
  }, [lines, rows, subject, compared, selected]);

  const played = rows.filter((row) => row.played);
  // Only a multiplayer campaign marks its players; one player is the followed country.
  const badges = !world && multiplayer && played.length > 0 && played.length < rows.length;
  const standingRows = useMemo((): StandingRow[] => {
    const figures = distinctTexts(
      standings.map((x) => x.value),
      format,
      fine,
    );
    const make = (row: BySaveRow, column: number, rank: string, figure: string, gone: boolean) => {
      const tag = row.cells[column]?.tag ?? "";
      const { role, pinned } = roles.get(row.key)!;
      const tags = row.lineage?.tags ?? [];
      return {
        key: row.key,
        rank,
        tag,
        name: nameOf(names, tag),
        note: heldNote(row, column, names),
        chain: tags.map((held) => ({
          tag: held.tag,
          name: nameOf(names, held.tag),
          span: `${held.from?.slice(0, 4) ?? "start"}–${held.until?.slice(0, 4) ?? ""}`,
        })),
        lineage: lineageText(row, names),
        figure,
        color: names.get(tag)?.color ?? "#808080",
        role,
        pinned,
        badge: badges && row.played,
        gone,
      };
    };
    const yearAt = (column: number) => String(columns[column].date.year);
    const noteOf = (absence: Absence<BySaveRow>) => {
      const note = absence.note;
      switch (note.kind) {
        case "noRecord":
          return "no record";
        case "until":
          return `until ${yearAt(note.column)}`;
        case "from":
          return `from ${yearAt(note.column)}`;
        case "between":
          return `back ${yearAt(note.from)}`;
      }
    };
    return [
      ...standings.map((x, i) =>
        make(x.row, selected, `${x.tied ? "=" : ""}${x.rank}`, figures[i], false),
      ),
      ...absent.map((x) => make(x.row, x.column, "", noteOf(x), true)),
    ];
  }, [standings, absent, names, selected, roles, badges, columns, format, fine]);
  const standingValues = useMemo(
    () => [...standings.map((x) => x.value), ...absent.map(() => null)],
    [standings, absent],
  );

  return {
    focus,
    subject,
    pins,
    pointed,
    compared,
    focusKey,
    setPointerKey,
    setFocusKey,
    escape,
    pick,
    standings,
    lines,
    comparison,
    standingRows,
    standingValues,
  };
}
