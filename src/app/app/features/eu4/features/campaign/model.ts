import type { Lineage, LineageCell, LineageValues } from "@/wasm/wasm_eu4";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { ChartedSave } from "@/features/campaign/types";
import { formatIsoDate, parseDate } from "@/features/timeline/date";

/** One country over time: a series of the chart and a row of the table. */
export type CampaignRow = {
  key: string;
  /** Null for the world total. */
  lineage: Lineage | null;
  /** The cell in each column, or null where the country has no value. */
  cells: (LineageCell | null)[];
  /** A save says the country was played at some point in the campaign. */
  played: boolean;
};

/** The columns of the chart and the table: the snapshots of the campaign saves, in date order. */
export type CampaignData = {
  columns: AnalysisSave[];
  rows: CampaignRow[];
  /** The tags whose holders cannot be told apart, which have no values. */
  unclear?: string[];
};

export type CountryInfo = { name: string; color: string };

/**
 * Where a save comes from. A local file is not called uploaded: an upload of
 * the same date can hold another save.
 */
export function sourceText(save: ChartedSave): string {
  if (save.source.kind === "figures") return "Figures only";
  if (save.source.kind === "local") return "Local file";
  return save.source.userName ? `Upload by ${save.source.userName}` : "Upload";
}

/** The number of a cell, or null for a country without a record. */
export function amount(cell: LineageCell | null): number | null {
  return cell?.kind === "value" ? cell.value : null;
}

/**
 * Keep the snapshots that are bound to a save of the campaign list, in the
 * order of the reply. A snapshot of a replaced file or of a save that the
 * list left out has no dot.
 */
export function alignColumns(
  snapshotIds: readonly string[],
  saves: readonly AnalysisSave[],
): { columns: AnalysisSave[]; at: number[] } {
  const bySnapshot = new Map(saves.flatMap((x) => (x.snapshot ? [[x.snapshot.id, x]] : [])));
  const columns: AnalysisSave[] = [];
  const at: number[] = [];
  snapshotIds.forEach((id, i) => {
    const save = bySnapshot.get(id);
    if (save) {
      columns.push(save);
      at.push(i);
    }
  });
  return { columns, at };
}

/** The tags that two countries changed to or from on one day. */
export function unclearTags(series: readonly { lineage: Lineage }[]): string[] {
  return series.flatMap((x) => (x.lineage.kind === "ambiguous" ? [x.lineage.tags[0].tag] : []));
}

/** A tag that the chart cannot follow, named for Not shown: "Name (TAG)". */
export function tagNote(names: ReadonlyMap<string, CountryInfo>, tag: string) {
  const name = names.get(tag)?.name;
  return name ? `${name} (${tag})` : tag;
}

/** Each lineage's value at the chart's columns, by row key, as `pick` reads a snapshot's. */
export function byKey<S extends { lineage: Lineage }, T>(
  series: readonly S[],
  snapshotIds: readonly string[],
  columns: readonly AnalysisSave[],
  pick: (lineage: S, snapshot: number) => T | null,
): Map<string, (T | null)[]> {
  const index = new Map(snapshotIds.map((id, i) => [id, i]));
  return new Map(
    series.map((x) => [
      lineageKey(x.lineage),
      columns.map((column) => {
        const i = column.snapshot ? index.get(column.snapshot.id) : undefined;
        return i === undefined ? null : pick(x, i);
      }),
    ]),
  );
}

/** The key of a lineage: its tags, each with the date it took the tag. */
export const lineageKey = (lineage: Pick<Lineage, "tags">) =>
  lineage.tags.map((held) => (held.from ? `${held.tag}@${held.from}` : held.tag)).join(">");

/** One row for each lineage, with its cells in the aligned columns. */
export function lineageRows(
  series: readonly LineageValues[],
  at: readonly number[],
): CampaignRow[] {
  return series
    .map((x) => ({
      key: lineageKey(x.lineage),
      lineage: x.lineage,
      cells: at.map((i) => x.values[i] ?? null),
      played: x.played,
    }))
    .filter((row) => row.cells.some((cell) => cell !== null));
}

/**
 * The rows that have a value at a column, largest first; a country without a
 * record comes last. A row without a cell at the column has no place.
 */
export function rowsAt(rows: readonly CampaignRow[], column: number): CampaignRow[] {
  const rank = (row: CampaignRow) => amount(row.cells[column]) ?? -Infinity;
  return rows
    .filter((row) => row.cells[column] !== null)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(b.row) - rank(a.row) || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * The index of the lineage tag that a row shows at a column. Without a cell
 * there, the row keeps its tag at the fallback column, else its latest one.
 */
export function heldIndex(row: CampaignRow, column: number, fallback = column): number | null {
  const cell = row.cells[column] ?? row.cells[fallback] ?? row.cells.findLast((x) => x !== null);
  return cell?.held ?? null;
}

/** A country's name, or its tag when the save has no name for it. */
export const nameOf = (names: ReadonlyMap<string, CountryInfo>, tag: string) =>
  names.get(tag)?.name ?? tag;

/**
 * A row's name at a column: by the tag it held there, else its nearest earlier
 * tag, else its next. The chip, the header prompt and the rival tooltip agree.
 */
export function nameNear(
  row: CampaignRow,
  column: number,
  names: ReadonlyMap<string, CountryInfo>,
): string {
  const cell =
    row.cells[column] ??
    row.cells.slice(0, column).findLast((c) => c !== null) ??
    row.cells.slice(column + 1).find((c) => c !== null);
  return nameOf(names, cell?.tag ?? "");
}

/** The tag that a row's country held at a column. */
export function rowTag(row: CampaignRow, column: number, fallback = column): string {
  const held = heldIndex(row, column, fallback);
  return (held !== null ? row.lineage?.tags[held]?.tag : undefined) ?? "";
}

/** The row's other tags, before and after the one it held at a column. */
export function otherTags(
  row: CampaignRow,
  column: number,
  fallback = column,
): { relation: "was" | "later"; tag: string; until: string | null; from: string | null }[] {
  const tags = row.lineage?.tags ?? [];
  const current = heldIndex(row, column, fallback);
  if (current === null) return [];
  return tags.flatMap((held, i) =>
    i === current
      ? []
      : [
          {
            relation: i < current ? ("was" as const) : ("later" as const),
            tag: held.tag,
            from: held.from ?? null,
            until: held.until ?? null,
          },
        ],
  );
}

/**
 * The other tags to name beside a row: the three nearest in time, earlier
 * ones first and nearest first, and how many more there are.
 */
export function nearestTags(row: CampaignRow, column: number, fallback = column) {
  const others = otherTags(row, column, fallback);
  const before = others.filter((x) => x.relation === "was").reverse();
  const after = others.filter((x) => x.relation === "later");
  const near = [...before, ...after].slice(0, 3);
  return { near, more: others.length - near.length };
}

/** The year of a switch date, for hover text. */
export function switchYear(date: string | null): string {
  return date ? String(parseDate(date)?.year ?? date) : "";
}

/** Each save's value of each row of each figure as CSV, one line per value, with the figure and its unit. */
export function campaignCsv(
  tables: readonly {
    data: CampaignData;
    figure: { title: string; unit: string };
  }[],
  names: ReadonlyMap<string, CountryInfo>,
) {
  const header = ["figure", "unit", "lineage", "country", "name", "date", "save", "value"];
  const lines = tables.flatMap(({ data, figure }) =>
    data.rows.flatMap((row) =>
      data.columns.flatMap((column, i) => {
        const value = amount(row.cells[i]);
        if (value === null) return [];
        const tag = row.cells[i]?.tag ?? "";
        return [
          [
            figure.title,
            figure.unit,
            row.key,
            tag,
            tag ? (names.get(tag)?.name ?? tag) : "All countries",
            formatIsoDate(column.date),
            column.save.name,
            // Values are single precision in the save.
            Number(value.toPrecision(7)),
          ],
        ];
      }),
    ),
  );
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [header, ...lines].map((line) => `${line.map(cell).join(",")}\n`).join("");
}

/**
 * Where the campaign's figures are saved, as a short label; Help says that a
 * browser without lasting storage may delete them.
 */
export function keptText(footer: { unreadable: boolean; kept: boolean; full: boolean }): string {
  if (footer.unreadable) return "Saved figures can't be read";
  const kept = footer.kept ? "Saved in this browser only" : "";
  const full = footer.full ? "Out of space: new figures not saved" : "";
  return [kept, full].filter(Boolean).join(" · ");
}
