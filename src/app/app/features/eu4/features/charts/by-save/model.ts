import type { CountryValue, CountryValues, TagSwitch } from "@/wasm/wasm_eu4";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { CampaignSave } from "@/features/campaign/types";
import { formatIsoDate, parseDate } from "@/features/timeline/date";

/** A series of the chart and a row of the table. */
export type BySaveRow = {
  key: string;
  label: string;
  /** The name beside the last dot, such as the tag. */
  short: string;
  color: string;
  /** The value in each column, or why there is none. */
  values: CountryValue[];
  /** The tags that a recorded switch made this one, such as "was Brandenburg · BRA until 1525". */
  was: string[];
};

/**
 * Where a save comes from. A local file is not called uploaded: an upload of
 * the same date can hold another save.
 */
export function sourceText(save: CampaignSave): string {
  if (save.source.kind === "local") return "Local file";
  return save.source.userName ? `Upload by ${save.source.userName}` : "Upload";
}

/** The number of a value of the row's country, or null where there is none. */
export function amount(value: CountryValue): number | null {
  return typeof value === "object" && "value" in value ? value.value : null;
}

/** The number of another country that had the tag on that date. */
export function otherAmount(value: CountryValue): number | null {
  return typeof value === "object" && "otherCountry" in value ? value.otherCountry : null;
}

/** The columns of the chart and the table: the snapshots of the campaign saves, in date order. */
export type BySaveData = { columns: AnalysisSave[]; rows: BySaveRow[] };

type CountryInfo = { name: string; color: string };

/** "France · FRA", or the tag alone when the open save has no name for it. */
export function countryLabel(tag: string, country: CountryInfo | undefined) {
  return country && country.name !== tag ? `${country.name} · ${tag}` : tag;
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

/**
 * One row for each country. Tags that a recorded switch joins are adjacent:
 * the later tag first, with the tags it was.
 */
export function countryRows(
  series: readonly CountryValues[],
  at: readonly number[],
  tags: readonly string[],
  /** The switches that pair the rows, as the country series judged them. */
  joins: readonly TagSwitch[],
  countries: ReadonlyMap<string, CountryInfo>,
): BySaveRow[] {
  const byTag = new Map(series.map((x) => [x.tag, x]));
  const label = (tag: string) => countryLabel(tag, countries.get(tag));
  const was = new Map<string, string[]>();
  for (const { from, to, date } of joins) {
    const until = parseDate(date);
    was.set(to, [...(was.get(to) ?? []), `was ${label(from)} until ${until ? until.year : date}`]);
  }
  // Order each pair by its chain: a switch puts the later tag before the earlier one.
  const order: string[] = [];
  const visit = (tag: string) => {
    if (order.includes(tag) || !byTag.has(tag)) return;
    order.push(tag);
    for (const x of joins) if (x.to === tag) visit(x.from);
  };
  const latest = tags.filter((tag) => !joins.some((x) => x.from === tag && byTag.has(x.to)));
  for (const tag of latest) visit(tag);
  for (const tag of tags) visit(tag);
  return (
    order
      .map((tag) => ({
        key: tag,
        label: label(tag),
        short: tag,
        color: countries.get(tag)?.color ?? "#808080",
        values: at.map((i) => byTag.get(tag)!.values[i]),
        was: was.get(tag) ?? [],
      }))
      // A tag with no value in any save has no row; its formed nation names it.
      .filter((row) => row.values.some((x) => amount(x) !== null || otherAmount(x) !== null))
  );
}

/** The countries of the rows, where tags that a switch joins count as one. */
export function countryCount(rows: readonly BySaveRow[], joins: readonly TagSwitch[]) {
  return new Set(groups(rows, joins).values()).size;
}

/** The groups of rows that a switch joins, so a sort keeps them adjacent. */
function groups(rows: readonly BySaveRow[], joins: readonly TagSwitch[]) {
  const group = new Map(rows.map((row, i) => [row.key, i]));
  for (const { from, to } of joins) {
    const a = group.get(from);
    const b = group.get(to);
    if (a === undefined || b === undefined) continue;
    for (const [key, value] of group) if (value === b) group.set(key, a);
  }
  return group;
}

/**
 * Sort by the value in a column, larger first. A group of joined tags
 * sorts by its largest value and keeps its order. Rows without a value
 * come last.
 */
export function sortRows(
  rows: readonly BySaveRow[],
  column: number,
  joins: readonly TagSwitch[],
): BySaveRow[] {
  const group = groups(rows, joins);
  const best = new Map<number, number>();
  for (const row of rows) {
    const value = amount(row.values[column]);
    const id = group.get(row.key)!;
    if (value !== null) best.set(id, Math.max(best.get(id) ?? -Infinity, value));
  }
  const rank = (row: BySaveRow) => best.get(group.get(row.key)!) ?? -Infinity;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(b.row) - rank(a.row) || a.index - b.index)
    .map(({ row }) => row);
}

/** The earliest column where a row has a value. */
export function earliestColumn(row: BySaveRow): number | null {
  const index = row.values.findIndex((value) => amount(value) !== null);
  return index < 0 ? null : index;
}

/** Each save's value of each row as CSV, one line per value, with the figure and its unit. */
export function bySaveCsv(data: BySaveData, figure: { title: string; unit: string }) {
  const header = ["figure", "unit", "country", "name", "date", "save", "value", "note"];
  const lines = data.rows.flatMap((row) =>
    data.columns.flatMap((column, i) => {
      const own = amount(row.values[i]);
      const other = otherAmount(row.values[i]);
      const value = own ?? other;
      if (value === null) return [];
      return [
        [
          figure.title,
          figure.unit,
          row.key,
          row.label,
          formatIsoDate(column.date),
          column.save.name,
          // Values are single precision in the save.
          Number(value.toPrecision(7)),
          other === null ? "" : "another country with this tag",
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
