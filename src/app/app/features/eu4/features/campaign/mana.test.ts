import { expect, it } from "vitest";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import {
  baselineOf,
  sinceHead,
  emptyText,
  manaReading,
  spentText,
  manaFigure,
  notCarried,
  nothingText,
  spentNothing,
  yearsText,
} from "./mana";
import type { CampaignRow } from "./model";

const save = (year: number, month = 1, day = 1) =>
  ({ date: { year, month, day } }) as unknown as AnalysisSave;

it("counts since from the watched session, else from the save before", () => {
  const columns = [save(1444, 11, 11), save(1521, 3), save(1525, 3), save(1527, 1, 27)];
  // Watching began at 1521: since counts from there, else from the save before.
  expect(baselineOf(3, 1)).toEqual({ column: 1 });
  expect(baselineOf(3, -1)).toEqual({ column: 2 });
  expect(baselineOf(0, -1)).toBeNull();
  expect(sinceHead(columns, { column: 1 }, 1)).toBe("since watching");
  expect(sinceHead(columns, { column: 2 }, -1)).toBe("since 1525 Mar 1");
  expect(yearsText(394)).toBe("1.1 years");
  // Two saves a game year apart: the game's years have 365 days.
  expect(yearsText(365)).toBe("1 year");
  expect(yearsText(110)).toBe("110 days");
});

it("asks for the chosen types and uses", () => {
  const view = { types: "dip", use: "develop", pool: "mil" } as const;
  expect(manaFigure("country", view)).toEqual({ kind: "spent", types: ["dip"], uses: ["develop"] });
  expect(manaFigure("banked", view)).toEqual({ kind: "pool", type: "mil" });
  const held = (...tags: string[]) => ({ lineage: { tags: tags.map((tag) => ({ tag })) } });
  expect(notCarried([held("ALO", "NBI"), held("MAM")], ["NBI", "RYU", "MAM"])).toEqual(["RYU"]);
  expect([spentText({ types: "all" }), spentText({ types: "adm" })]).toEqual([
    "mana",
    "admin mana",
  ]);
});

it("says what was not spent", () => {
  const military = { types: "mil", use: "stability", pool: "adm" } as const;
  const empty = {
    reading: false,
    failed: false,
    hasResult: true,
    allSpentNothing: true,
    view: military,
  };
  expect(emptyText(empty)).toBe("No country of the chart spent military mana on stability.");
  expect(emptyText({ ...empty, reading: true })).toMatch(/^Reading/);
  expect(emptyText({ ...empty, failed: true, reading: true })).toBeNull();
  // Stopped before the first snapshot: no result, nothing reading, and the band says why.
  expect(emptyText({ ...empty, hasResult: false })).toBeNull();
  const idle = { countriesLoading: false, queryLoading: false, campaignReading: false };
  expect(manaReading({ ...idle, hasResult: false })).toBe(false);
  expect(manaReading({ ...idle, campaignReading: true, hasResult: false })).toBe(true);
  expect(manaReading({ ...idle, campaignReading: true, hasResult: true })).toBe(false);
  expect(manaReading({ ...idle, countriesLoading: true, hasResult: true })).toBe(true);
  const view = { types: "all", use: "all", pool: "adm" } as const;
  expect(nothingText(view, ["Muscovy", "Bohemia"])).toBe("Muscovy and Bohemia: nothing spent");
  expect(nothingText({ ...view, types: "adm", use: "develop" }, ["Muscovy"])).toBe(
    "Muscovy: no admin mana spent on developing provinces",
  );
});

it("keeps the followed country drawn when it spent nothing on the choice", () => {
  const row = (key: string, value: number): CampaignRow => ({
    key,
    lineage: null,
    played: key === "NBI",
    cells: [{ kind: "value", tag: key, held: 0, value }],
  });
  const rows = [row("NBI", 0), row("MAM", 120), row("ADA", 0)];
  expect(spentNothing(rows, "NBI").map((x) => x.key)).toEqual(["ADA"]);
  expect(spentNothing(rows, null).map((x) => x.key)).toEqual(["NBI", "ADA"]);
  // Nobody spent anything: the followed row goes too, so the sheet says so instead.
  const zeros = [row("NBI", 0), row("ADA", 0)];
  expect(spentNothing(zeros, "NBI").map((x) => x.key)).toEqual(["NBI", "ADA"]);
});
