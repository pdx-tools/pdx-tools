import { describe, expect, it } from "vitest";
import { snapshotId } from "@/features/campaign/analysis/descriptor";
import { Eu5CampaignAnalysis } from "./analysisStore";
import type { SaveAnalysis, SnapshotTables } from "./analysisTypes";
import { BREAKDOWNS, COUNTRY_METRICS, MARKET_METRICS } from "./snapshotTables";

type TestCountry = { id: number; tag: string; population: number; religions?: [string, number][] };
type TestMarket = { center: number; name: string; good: string; price: number };

/** Build the tables as `eu5app::snapshot::extract` does. */
function tables(countries: TestCountry[] = [], markets: TestMarket[] = []): SnapshotTables {
  const strings: string[] = [];
  const key = (value: string) => {
    const index = strings.indexOf(value);
    return index >= 0 ? index : strings.push(value) - 1;
  };
  const sorted = [...countries].sort((a, b) => a.id - b.id);
  const values: number[] = [];
  const offsets = [0];
  const keys: number[] = [];
  const breakdownValues: number[] = [];
  for (const country of sorted) {
    for (const metric of COUNTRY_METRICS)
      values.push(
        metric === "population" ? country.population : metric === "greatPowerRank" ? NaN : 1,
      );
    for (const breakdown of BREAKDOWNS) {
      if (breakdown === "religions")
        for (const [name, value] of country.religions ?? []) {
          keys.push(key(name));
          breakdownValues.push(value);
        }
      offsets.push(keys.length);
    }
  }
  return {
    strings,
    countryMetrics: [...COUNTRY_METRICS],
    marketMetrics: [...MARKET_METRICS],
    countryIds: Uint32Array.from(sorted, (c) => c.id),
    countryTags: Uint32Array.from(sorted, (c) => key(c.tag)),
    countryLocations: Uint32Array.from(sorted, () => 1),
    countryValues: Float64Array.from(values),
    breakdownOffsets: Uint32Array.from(offsets),
    breakdownKeys: Uint32Array.from(keys),
    breakdownValues: Float32Array.from(breakdownValues),
    countryMarketOffsets: new Uint32Array(sorted.length + 1),
    countryMarkets: new Uint32Array(),
    marketCenters: Uint32Array.from(markets, (m) => m.center),
    marketCenterNames: Uint32Array.from(markets, (m) => key(m.name)),
    marketGoods: Uint32Array.from(markets, (m) => key(m.good)),
    marketValues: Float32Array.from(markets.flatMap((m) => [m.price, 10, 9, NaN])),
  };
}

const id = (hash: string) => snapshotId("eu5", 1, hash);
const save = (hash = "first", dateSort = 13600101, campaignId = "campaign"): SaveAnalysis => ({
  descriptor: {
    id: id(hash),
    game: "eu5",
    contentHash: hash,
    extractorVersion: 1,
    artifacts: ["observations", "map"],
    dateSort,
    date: "1360-01-01",
    campaignId,
    gameVersion: "1.4.0",
    layoutKey: "same",
    world: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
  },
  payload: {
    projection: {
      layoutKey: "same",
      locationIds: new Uint32Array([42]),
      fractions: new Uint16Array([49151, 65535]),
      metrics: new Float32Array([12, 10, 3, 2, 3, 1, 0.1]),
      owners: new Uint32Array([7]),
      controllers: new Uint32Array([7]),
      religions: new Uint32Array([1]),
      markets: new Uint32Array([4]),
      countries: new Uint32Array([7, 1, 1, 1]),
      religionColors: new Uint32Array([1, 1]),
      marketColors: new Uint32Array([4, 42, 1]),
    },
    tables: tables(),
  },
});

/** A save with two locations, 42 and 43, whose populations are given. */
function campaignSave(
  hash: string,
  dateSort: number,
  population: [number, number] | [number],
  countries: TestCountry[],
  markets: TestMarket[],
): SaveAnalysis {
  const base = save(hash, dateSort);
  const n = population.length;
  const layoutKey = n === 2 ? "two" : "one";
  base.descriptor.layoutKey = layoutKey;
  base.payload.projection = {
    ...base.payload.projection,
    layoutKey,
    locationIds: Uint32Array.from([42, 43].slice(0, n)),
    fractions: new Uint16Array(n * 2),
    metrics: Float32Array.from(population.flatMap((p) => [0, p, 0, 0, 0, 0, 0])),
    owners: new Uint32Array(n),
    controllers: new Uint32Array(n),
    religions: new Uint32Array(n),
    markets: new Uint32Array(n),
  };
  base.payload.tables = tables(countries, markets);
  return base;
}
it("shares the location IDs of equal layouts", () => {
  const analysis = new Eu5CampaignAnalysis();
  analysis.append(save("later", 13600401));
  const before = analysis.mapFrame(id("later"));
  analysis.append(save());
  expect(analysis.store.timeline("campaign").map((row) => row.contentHash)).toEqual([
    "first",
    "later",
  ]);
  expect(analysis.mapFrame(id("first")).projection.locationIds).toBe(before.projection.locationIds);
  expect(analysis.mapFrame(id("first")).descriptor.layoutKey).toBe("same");
});
it("rejects incomplete columns and incompatible layouts", () => {
  const analysis = new Eu5CampaignAnalysis();
  analysis.append(save());
  const broken = save("broken", 13600401);
  broken.payload.projection.metrics = new Float32Array(1);
  expect(() => analysis.append(broken)).toThrow("Incomplete");
  const mismatch = save("mismatch", 13600401);
  mismatch.descriptor.layoutKey = "other";
  expect(() => analysis.append(mismatch)).toThrow("Incomplete");
  const other = save("other", 13600401);
  other.payload.projection.locationIds[0] = 77;
  expect(() => analysis.append(other)).toThrow("Incompatible");
  expect(analysis.store.timeline("campaign")).toHaveLength(1);
});

it("rejects tables with a missing row or from a different version", () => {
  const analysis = new Eu5CampaignAnalysis();
  const broken = save();
  broken.payload.tables = tables([{ id: 1, tag: "AAA", population: 1 }]);
  broken.payload.tables.countryValues = new Float64Array(1);
  expect(() => analysis.append(broken)).toThrow("Incomplete snapshot tables");
  const other = save();
  other.payload.tables.countryMetrics = ["population"];
  expect(() => analysis.append(other)).toThrow("different version");
  expect(analysis.store.timeline("campaign")).toHaveLength(0);
});

describe("queries", () => {
  // Country 0x0100_0007 takes the low bits of country 7 after country 7 ends.
  const reused = 0x0100_0007;
  const store = new Eu5CampaignAnalysis();
  store.append(
    campaignSave(
      "a",
      14000101,
      [100, 50],
      [
        { id: 7, tag: "OLD", population: 10, religions: [["catholic", 10]] },
        { id: 9, tag: "FRA", population: 20 },
      ],
      [{ center: 42, name: "paris", good: "wheat", price: 2 }],
    ),
  );
  store.append(
    campaignSave(
      "b",
      14100101,
      [120, 60],
      [
        // The country changes its tag, but keeps its ID.
        { id: 7, tag: "NEW", population: 12, religions: [["catholic", 12]] },
        { id: 9, tag: "FRA", population: 21 },
      ],
      // Another market ID can have this center. The center is the identity.
      [{ center: 43, name: "lyon", good: "wheat", price: 5 }],
    ),
  );
  store.append(
    campaignSave(
      "c",
      14200101,
      [130],
      [
        { id: reused, tag: "OLD", population: 3 },
        { id: 9, tag: "FRA", population: 22 },
      ],
      [{ center: 42, name: "paris", good: "wheat", price: 3 }],
    ),
  );

  it("follows a country by its full ID across a tag change", () => {
    const result = store.countryHistory("campaign", { kind: "country", id: 7 });
    expect(result.snapshots).toBe(3);
    expect(result.rows.map((row) => row.value?.population ?? null)).toEqual([10, 12, null]);
    expect(result.rows.map((row) => row.value?.tag ?? null)).toEqual(["OLD", "NEW", null]);
    expect(result.rows[1].value?.religions.get("catholic")).toBe(12);
    expect(result.rows[0].value?.greatPowerRank).toBeNull();
    const next = store.countryHistory("campaign", { kind: "country", id: reused });
    expect(next.rows.map((row) => row.value?.population ?? null)).toEqual([null, null, 3]);
  });

  it("sums all countries for the world", () => {
    const result = store.countryHistory("campaign", { kind: "world" });
    expect(result.rows.map((row) => row.value?.population)).toEqual([30, 33, 25]);
    expect(result.rows[0].value?.religions.get("catholic")).toBe(10);
  });

  it("sums a fixed set of locations, and a missing location is a gap", () => {
    const result = store.locationPopulation("campaign", [42, 43]);
    expect(result.rows.map((row) => row.value)).toEqual([150, 180, null]);
    expect(store.locationPopulation("campaign", [42]).rows.map((row) => row.value)).toEqual([
      100, 120, 130,
    ]);
  });

  it("follows a market by its center, with a gap where the center has no market", () => {
    const result = store.marketHistory("campaign", "wheat", [42, 43]);
    expect(result.rows.map((row) => row.value?.map((m) => m?.price ?? null))).toEqual([
      [2, null],
      [null, 5],
      [3, null],
    ]);
    expect(result.rows[0].value?.[0]?.stockpile).toBeNull();
    expect(result.rows[0].value?.[0]?.centerName).toBe("paris");
    expect(store.marketCatalog("campaign")).toEqual({
      goods: ["wheat"],
      centers: [
        { center: 42, name: "paris" },
        { center: 43, name: "lyon" },
      ],
    });
  });

  it("uses the snapshots that the store has when the query runs", () => {
    const growing = new Eu5CampaignAnalysis();
    growing.append(campaignSave("x", 14000101, [1, 1], [{ id: 1, tag: "A", population: 1 }], []));
    const before = growing.countryHistory("campaign", { kind: "world" });
    growing.append(campaignSave("y", 14100101, [1, 1], [{ id: 1, tag: "A", population: 2 }], []));
    expect(before.snapshots).toBe(1);
    expect(before.rows).toHaveLength(1);
    expect(growing.countryHistory("campaign", { kind: "world" }).snapshots).toBe(2);
  });
});
