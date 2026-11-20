import { expect, it } from "vitest";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { LineageValues } from "@/wasm/wasm_eu4";
import { alignColumns, lineageRows, otherTags, rowTag, rowsAt } from "./model";

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

it("gives each country one row named by the tag it held, sorted at the selected save", () => {
  const value = (tag: string, value: number) => ({ kind: "value" as const, tag, value });
  const series: LineageValues[] = [
    {
      lineage: {
        kind: "country",
        tags: [
          { tag: "ALO", until: "1451-01-01" },
          { tag: "NBI", from: "1451-01-01" },
        ],
      },
      values: [value("ALO", 21), value("NBI", 748)],
    },
    {
      lineage: { kind: "country", tags: [{ tag: "FRA" }] },
      values: [value("FRA", 252), value("FRA", 901)],
    },
    // The first Byzantium, before another country took the tag.
    {
      lineage: { kind: "earlierHolder", tags: [{ tag: "BYZ", until: "1500-01-01" }] },
      values: [value("BYZ", 30), undefined],
    },
    // No value in any save: no row.
    { lineage: { kind: "country", tags: [{ tag: "MLO" }] }, values: [undefined, undefined] },
  ];
  const rows = lineageRows(series, [0, 1]);
  expect(rows.map((x) => x.key)).toEqual(["ALO>NBI@1451-01-01", "FRA", "BYZ"]);

  const early = rowsAt(rows, 0);
  expect(early.map((row) => rowTag(row, 0))).toEqual(["FRA", "BYZ", "ALO"]);
  expect(otherTags(early[2], 0)).toEqual([
    { relation: "later", tag: "NBI", from: "1451-01-01", until: null },
  ]);

  // Byzantium has no value at the later save, so it has no row there.
  const late = rowsAt(rows, 1);
  expect(late.map((row) => rowTag(row, 1))).toEqual(["FRA", "NBI"]);
  expect(otherTags(late[1], 1)).toEqual([
    { relation: "was", tag: "ALO", from: null, until: "1451-01-01" },
  ]);
});
