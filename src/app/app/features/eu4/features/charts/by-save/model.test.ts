import { expect, it } from "vitest";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { alignColumns, countryRows, sortRows } from "./model";

const save = (id: string, year: number) =>
  ({
    save: { key: id, date: { year, month: 1, day: 1 }, name: `${id}.eu4` },
    status: "ready",
    snapshot: { id },
    error: null,
  }) as unknown as AnalysisSave;

it("keeps only the snapshots of the campaign saves, in reply order", () => {
  const saves = [save("a", 1444), save("c", 1600)];
  const { columns, at } = alignColumns(["a", "b", "c"], saves);
  expect(columns.map((x) => x.snapshot!.id)).toEqual(["a", "c"]);
  expect(at).toEqual([0, 2]);
});

it("lists a formed nation beside the tag it was, and sorts countries without land last", () => {
  const chart = {
    tags: ["BRA", "FRA", "PRU", "SWE"],
    switches: [{ from: "BRA", to: "PRU", date: "1525-01-01" }],
  };
  const countries = new Map([
    ["BRA", { name: "Brandenburg", color: "#000" }],
    ["PRU", { name: "Prussia", color: "#111" }],
    ["FRA", { name: "France", color: "#222" }],
  ]);
  const series = [
    { key: "BRA", values: [211, undefined] },
    { key: "FRA", values: [402, 744] },
    { key: "PRU", values: [undefined, 544] },
    { key: "SWE", values: [300, undefined] },
  ];
  const rows = countryRows(series, [0, 1], chart, countries);
  expect(rows.map((x) => x.key)).toEqual(["FRA", "PRU", "BRA", "SWE"]);
  expect(rows[1]).toMatchObject({
    label: "Prussia · PRU",
    values: [null, 544],
    was: ["was Brandenburg · BRA until 1525"],
  });
  expect(rows[3].label).toBe("SWE");

  expect(sortRows(rows, 1, chart).map((x) => x.key)).toEqual(["FRA", "PRU", "BRA", "SWE"]);
  // A pair sorts by its larger value and keeps its order.
  expect(sortRows(rows, 0, chart).map((x) => x.key)).toEqual(["FRA", "SWE", "PRU", "BRA"]);
});
