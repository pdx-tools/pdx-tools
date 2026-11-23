import { expect, it } from "vitest";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { LineageValues } from "@/wasm/wasm_eu4";
import type { CampaignRow } from "./model";
import {
  keptText,
  alignColumns,
  campaignCsv,
  lineageRows,
  nearestTags,
  otherTags,
  rowTag,
  rowsAt,
} from "./model";

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
  const value = (tag: string, value: number, held = 0) => ({
    kind: "value" as const,
    tag,
    held,
    value,
  });
  const series: LineageValues[] = [
    {
      played: false,
      lineage: {
        kind: "country",
        tags: [
          { tag: "ALO", until: "1451-01-01" },
          { tag: "NBI", from: "1451-01-01" },
        ],
      },
      values: [value("ALO", 21), value("NBI", 748, 1)],
    },
    {
      played: false,
      lineage: { kind: "country", tags: [{ tag: "FRA" }] },
      values: [value("FRA", 252), value("FRA", 901)],
    },
    // The first Byzantium, before another country took the tag.
    {
      played: false,
      lineage: { kind: "earlierHolder", tags: [{ tag: "BYZ", until: "1500-01-01" }] },
      values: [value("BYZ", 30), undefined],
    },
    // No value in any save: no row.
    {
      played: false,
      lineage: { kind: "country", tags: [{ tag: "MLO" }] },
      values: [undefined, undefined],
    },
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

it("names a row by the tag it held at the column, even a tag it held twice", () => {
  const cell = (tag: string, held: number) => ({ kind: "value" as const, tag, held, value: 1 });
  // Austria forms Bohemia and later takes back its tag.
  const series: LineageValues[] = [
    {
      played: false,
      lineage: {
        kind: "country",
        tags: [
          { tag: "HAB", until: "1500-01-01" },
          { tag: "BOH", from: "1500-01-01", until: "1600-01-01" },
          { tag: "HAB", from: "1600-01-01" },
        ],
      },
      values: [cell("HAB", 0), cell("BOH", 1), undefined, cell("HAB", 2)],
    },
  ];
  const [row] = lineageRows(series, [0, 1, 2, 3]);
  expect(otherTags(row, 3)).toEqual([
    { relation: "was", tag: "HAB", from: null, until: "1500-01-01" },
    { relation: "was", tag: "BOH", from: "1500-01-01", until: "1600-01-01" },
  ]);
  expect(otherTags(row, 0).map((x) => x.relation)).toEqual(["later", "later"]);

  // Without a cell at a hovered column, the row keeps its selected name.
  expect(rowTag(row, 2, 1)).toBe("BOH");
});

it("names the three nearest other tags of a long chain and counts the rest", () => {
  const tags = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"].map((tag, i, all) => ({
    tag,
    ...(i > 0 && { from: `${1450 + i}-01-01` }),
    ...(i < all.length - 1 && { until: `${1451 + i}-01-01` }),
  }));
  const [row] = lineageRows(
    [
      {
        played: false,
        lineage: { kind: "country", tags },
        values: [{ kind: "value", tag: "EEE", held: 4, value: 1 }],
      },
    ],
    [0],
  );
  const { near, more } = nearestTags(row, 0);
  expect(near.map((x) => `${x.relation} ${x.tag}`)).toEqual(["was DDD", "was CCC", "was BBB"]);
  expect(more).toBe(2);
});

it("writes each figure's values to one CSV, leaving out a country without a record", () => {
  const columns = [save("a", 1444)];
  const row = (cell: CampaignRow["cells"][number]) => ({
    key: "ENG",
    lineage: null,
    played: false,
    cells: [cell],
  });
  const csv = campaignCsv(
    [
      {
        figure: { title: "Development", unit: "development points" },
        data: { columns, rows: [row({ kind: "value", tag: "ENG", held: 0, value: -12.5 })] },
      },
      {
        figure: { title: "Manpower", unit: "thousands of men" },
        data: { columns, rows: [row({ kind: "noRecord", tag: "ENG", held: 0 })] },
      },
    ],
    new Map([["ENG", { name: "England", color: "#c00" }]]),
  );
  expect(csv.trim().split("\n")).toEqual([
    "figure,unit,lineage,country,name,date,save,value",
    "Development,development points,ENG,ENG,England,1444-01-01,a.eu4,-12.5",
  ]);
});

it("labels where the figures are saved, the same with or without lasting storage", () => {
  const kept = { unreadable: false, kept: true, full: false };
  expect(keptText(kept)).toBe("Saved in this browser only");
  expect(keptText({ ...kept, full: true })).toBe(
    "Saved in this browser only · Out of space: new figures not saved",
  );
  expect(keptText({ ...kept, unreadable: true })).toBe("Saved figures can't be read");
});
