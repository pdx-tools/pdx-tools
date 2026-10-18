import { describe, expect, it } from "vitest";
import { packSnapshot, snapshotView, snapshotCountry } from "./packedSnapshot";
import type { Snapshot } from "./types";
import { exportSnapshots } from "./exportSnapshots";

const snapshot = (): Snapshot => ({
  hash: "eu5:test",
  fileName: "save.eu5",
  marketLabels: { "42": "London" },
  campaignId: "campaign",
  date: "1360-04-01",
  dateSort: 13600401,
  version: "1.4.0",
  population: 1e12 + 0.125,
  development: 42.123456789,
  countries: [
    {
      tag: "ENG",
      countryId: 7,
      population: 123456789.12345679,
      development: 12.123456789,
      locations: 2,
      wealth: 1.0123456789,
      tax: 2,
      effectiveDevelopment: 3,
      stateCapacity: 4,
      births: 5,
      ruralPopulation: 6,
      urbanPopulation: 7,
      rgoLevels: 8,
      buildingLevels: 9,
      buildingEmployment: 10,
      income: 11,
      greatPowerRank: undefined,
      religions: new Map([["catholic", 0.12345678912345678]]),
      materials: new Map([["grain", 3.141592653589793]]),
      buildings: new Map([["farm", 2.5]]),
      marketCenters: [42, 43],
    },
  ],
  markets: [
    {
      center: 42,
      centerName: "london",
      marketId: 7,
      good: "grain",
      price: 0.12345678912345678,
      supply: undefined,
      demand: 1e12 + 0.125,
      stockpile: 0,
    },
    {
      center: 43,
      centerName: undefined,
      marketId: 8,
      good: "grain",
      price: undefined,
      supply: 0,
      demand: undefined,
      stockpile: undefined,
    },
  ],
});
describe("packed historical observations", () => {
  it("round-trips every field without reducing chart precision or filling gaps", () => {
    const original = snapshot();
    const view = snapshotView(structuredClone(packSnapshot(original)));
    expect(view).toEqual(original);
    expect(view.countries[0].religions).toEqual(original.countries[0].religions);
    expect(view.markets.map((m) => m.price)).toEqual([original.markets[0].price, undefined]);
    expect(view.countries.find((c) => c.tag === "ENG")?.population).toBe(
      original.countries[0].population,
    );
    expect([...view.markets]).toHaveLength(2);
    expect(view.markets.slice(1)).toEqual([original.markets[1]]);
    expect(view.markets.filter((m) => m.stockpile !== undefined)).toEqual([original.markets[0]]);
    expect(view.countries.reduce((sum, c) => sum + c.population, 0)).toBe(
      original.countries[0].population,
    );
  });
  it("exports the same public JSON schema and original values", async () => {
    const original = snapshot();
    const a = JSON.parse(await exportSnapshots([snapshotView(packSnapshot(original))]).text());
    const b = JSON.parse(await exportSnapshots([original]).text());
    expect(a).toEqual(b);
  });
  it("finds country rows directly, preserving absent records", () => {
    const packed = packSnapshot(snapshot()),
      view = snapshotView(packed);
    expect(snapshotCountry(packed, "id:7")).toEqual(view.countries[0]);
    expect(snapshotCountry(packed, "id:999")).toBeUndefined();
  });
  it("rejects incompatible or corrupted cached columns", () => {
    const packed = packSnapshot(snapshot());
    expect(() => snapshotView({ ...packed, marketValues: new Float64Array(1) })).toThrow("lengths");
    const bad = structuredClone(packed);
    bad.marketIds[0] = 99999;
    expect(() => snapshotView(bad)).toThrow("market dictionary");
    const offset = structuredClone(packed);
    offset.countryOffsets[0] = 99999;
    expect(() => snapshotView(offset)).toThrow("breakdown range");
  });
  it("query results cannot mutate the resident columns", () => {
    const packed = packSnapshot(snapshot());
    const first = snapshotView(packed);
    first.markets[0].price = 3;
    first.countries[0].religions.set("catholic", 99);
    const second = snapshotView(packed);
    expect(second).toEqual(snapshot());
  });
});
