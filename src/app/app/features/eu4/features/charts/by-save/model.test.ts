import { expect, it } from "vitest";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { CountryValues } from "@/wasm/wasm_eu4";
import { alignColumns, countryRows, sortRows } from "./model";

const save = (id: string, year: number) =>
  ({
    save: { key: id, date: { year, month: 1, day: 1 }, name: `${id}.eu4` },
    date: { year, month: 1, day: 1 },
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
  const tags = ["BRA", "FRA", "MLO", "PRU", "SWE"];
  const joins = [{ from: "BRA", to: "PRU", date: "1525-01-01" }];
  const countries = new Map([
    ["BRA", { name: "Brandenburg", color: "#000" }],
    ["PRU", { name: "Prussia", color: "#111" }],
    ["FRA", { name: "France", color: "#222" }],
  ]);
  const series = [
    { tag: "BRA", values: [{ value: 211 }, "noProvinces"] },
    { tag: "FRA", values: [{ value: 402 }, { value: 744 }] },
    { tag: "PRU", values: ["noProvinces", { value: 544 }] },
    { tag: "SWE", values: [{ value: 300 }, "noProvinces"] },
    // A tag with no value in any save has no row.
    { tag: "MLO", values: ["noProvinces", "noProvinces"] },
  ] as const satisfies readonly CountryValues[];
  const rows = countryRows(series, [0, 1], tags, joins, countries);
  expect(rows.map((x) => x.key)).toEqual(["FRA", "PRU", "BRA", "SWE"]);
  expect(rows[1]).toMatchObject({
    label: "Prussia · PRU",
    values: ["noProvinces", { value: 544 }],
    was: ["was Brandenburg · BRA until 1525"],
  });
  expect(rows[3].label).toBe("SWE");

  expect(sortRows(rows, 1, joins).map((x) => x.key)).toEqual(["FRA", "PRU", "BRA", "SWE"]);
  // A pair sorts by its larger value and keeps its order.
  expect(sortRows(rows, 0, joins).map((x) => x.key)).toEqual(["FRA", "SWE", "PRU", "BRA"]);
});
