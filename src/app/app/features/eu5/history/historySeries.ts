import type { HistoryRow } from "./analysisStore";

export type HistoryLine = { name: string; values: (number | null)[] };

/**
 * Divide each value by the first value of the line, so the first value is
 * 100. A missing value stays a gap. A line that does not start with a
 * positive value cannot be an index, so all its values are gaps.
 */
export function indexedValues(values: readonly (number | null)[]): (number | null)[] {
  const first = values.find((value) => value != null && Number.isFinite(value));
  return values.map((value) =>
    value == null || !Number.isFinite(value) || first == null || first <= 0
      ? null
      : (value / first) * 100,
  );
}

/** One CSV row for each snapshot and line. Each row has the save hash and version. */
export function historyCsv(
  rows: readonly Pick<HistoryRow<unknown>, "hash" | "date" | "version">[],
  campaignId: string,
  lines: readonly HistoryLine[],
  options: { metric: string; good?: string; indexed?: boolean },
): string {
  const header = [
    "date",
    "campaign",
    "game_version",
    "entity",
    "good",
    "metric",
    "value_basis",
    "value",
    "save_content_hash",
  ];
  const body = rows.flatMap((row, index) =>
    lines.map((line) => [
      row.date,
      campaignId,
      row.version,
      line.name,
      options.good ?? "",
      options.metric,
      options.indexed ? "first_observation_100" : "raw",
      line.values[index] == null ? "" : String(line.values[index]),
      row.hash,
    ]),
  );
  return [header, ...body]
    .map((cells) => cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export function downloadFile(name: string, data: string | Blob, type: string) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
