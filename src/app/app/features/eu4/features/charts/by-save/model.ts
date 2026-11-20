import type { Lineage, LineageCell, LineageValues } from "@/wasm/wasm_eu4";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { CampaignSave } from "@/features/campaign/types";
import { formatIsoDate, parseDate } from "@/features/timeline/date";

/** One country over time: a series of the chart and a row of the table. */
export type BySaveRow = {
  key: string;
  /** Null for the world total. */
  lineage: Lineage | null;
  /** The cell in each column, or null where the country has no value. */
  cells: (LineageCell | null)[];
};

/** The columns of the chart and the table: the snapshots of the campaign saves, in date order. */
export type BySaveData = { columns: AnalysisSave[]; rows: BySaveRow[] };

export type CountryInfo = { name: string; color: string };

/**
 * Where a save comes from. A local file is not called uploaded: an upload of
 * the same date can hold another save.
 */
export function sourceText(save: CampaignSave): string {
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

/** One row for each lineage, with its cells in the aligned columns. */
export function lineageRows(series: readonly LineageValues[], at: readonly number[]): BySaveRow[] {
  return series
    .map((x) => ({
      key: x.lineage.tags
        .map((held) => (held.from ? `${held.tag}@${held.from}` : held.tag))
        .join(">"),
      lineage: x.lineage,
      cells: at.map((i) => x.values[i] ?? null),
    }))
    .filter((row) => row.cells.some((cell) => cell !== null));
}

/**
 * The rows that have a value at a column, largest first; a country without a
 * record comes last. A row without a cell at the column has no place.
 */
export function rowsAt(rows: readonly BySaveRow[], column: number): BySaveRow[] {
  const rank = (row: BySaveRow) => amount(row.cells[column]) ?? -Infinity;
  return rows
    .filter((row) => row.cells[column] !== null)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(b.row) - rank(a.row) || a.index - b.index)
    .map(({ row }) => row);
}

/** The tag that a row's country held at a column, or its latest tag with a value. */
export function rowTag(row: BySaveRow, column: number): string {
  const cell = row.cells[column] ?? row.cells.findLast((x) => x !== null);
  return cell?.tag ?? row.lineage?.tags[0]?.tag ?? "";
}

/** The other tags of a row's country, as they read beside the tag held at a column. */
export function otherTags(
  row: BySaveRow,
  column: number,
): { relation: "was" | "later"; tag: string; until: string | null; from: string | null }[] {
  const tags = row.lineage?.tags ?? [];
  const current = tags.findIndex((held) => held.tag === rowTag(row, column));
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

/** The year of a switch date, for hover text. */
export function switchYear(date: string | null): string {
  return date ? String(parseDate(date)?.year ?? date) : "";
}

/** Each save's value of each row as CSV, one line per value, with the figure and its unit. */
export function bySaveCsv(
  data: BySaveData,
  figure: { title: string; unit: string },
  names: ReadonlyMap<string, CountryInfo>,
) {
  const header = ["figure", "unit", "lineage", "country", "name", "date", "save", "value"];
  const lines = data.rows.flatMap((row) =>
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
  );
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [header, ...lines].map((line) => `${line.map(cell).join(",")}\n`).join("");
}
