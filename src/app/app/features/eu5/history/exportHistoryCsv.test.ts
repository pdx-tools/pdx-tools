import { expect, it } from "vitest";
import { exportHistoryCsv, historySeriesValues } from "./exportHistoryCsv";
import type { Snapshot } from "./types";

const dates = ["1360-01-01", "1360-04-01"].map((date) => ({
  date,
  campaignId: "campaign",
  version: "1.4",
  hash: `eu5:${date}`,
})) as Snapshot[];

it("exports the indexed values shown by the chart and labels their basis", () => {
  const csv = exportHistoryCsv(dates, [{ name: "Paris", raw: [2, 4] }], {
    metric: "price",
    good: "grain",
    indexed: true,
  });
  const rows = csv
    .split("\n")
    .slice(1)
    .map((row) => row.split(","));
  expect(rows.map((row) => row[7])).toEqual(['"100"', '"200"']);
  expect(rows.map((row) => row[6])).toEqual(['"first_observation_100"', '"first_observation_100"']);
  expect(historySeriesValues([2, 4], true)).toEqual([100, 200]);
});

it("preserves raw observations and escapes entity names", () => {
  const csv = exportHistoryCsv(dates, [{ name: 'Paris "market"', raw: [2, 4] }], {
    metric: "price",
    good: "grain",
    indexed: false,
  });
  expect(csv).toContain('"Paris ""market""","grain","price","raw","2"');
  expect(csv).toContain('"raw","4"');
});

it("leaves gaps and unavailable indexes empty rather than exporting misleading numbers", () => {
  expect(historySeriesValues([null, NaN, 2, Infinity, 4], true)).toEqual([
    null,
    null,
    100,
    null,
    200,
  ]);
  expect(historySeriesValues([0, 5], true)).toEqual([null, null]);
  const csv = exportHistoryCsv(dates, [{ name: "Paris", raw: [0, 5] }], {
    metric: "price",
    good: "grain",
    indexed: true,
  });
  expect(
    csv
      .split("\n")
      .slice(1)
      .every((row) => row.includes('"first_observation_100",""')),
  ).toBe(true);
});
