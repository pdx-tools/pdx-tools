import type { Snapshot } from "./types";

/** Apply the displayed index while preserving missing and non-finite observations as gaps. */
export function historySeriesValues(
  raw: (number | null | undefined)[],
  indexed: boolean,
): (number | null)[] {
  const baseline = raw.find((value) => value != null && Number.isFinite(value));
  return raw.map((value) =>
    value == null || !Number.isFinite(value)
      ? null
      : !indexed
        ? value
        : baseline != null && baseline > 0
          ? (value / baseline) * 100
          : null,
  );
}

export function exportHistoryCsv(
  dates: Snapshot[],
  series: { name: string; raw: (number | null | undefined)[] }[],
  options: { metric: string; good: string; indexed: boolean },
): string {
  const rows = [
    [
      "date",
      "campaign",
      "game_version",
      "entity",
      "good",
      "metric",
      "value_basis",
      "value",
      "save_content_hash",
    ],
  ];
  const plotted = series.map((line) => ({
    ...line,
    values: historySeriesValues(line.raw, options.indexed),
  }));
  dates.forEach((date, index) =>
    plotted.forEach((line) =>
      rows.push([
        date.date,
        date.campaignId,
        date.version,
        line.name,
        options.good,
        options.metric,
        options.indexed ? "first_observation_100" : "raw",
        line.values[index] == null ? "" : String(line.values[index]),
        date.hash,
      ]),
    ),
  );
  return rows
    .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
    .join("\n");
}
