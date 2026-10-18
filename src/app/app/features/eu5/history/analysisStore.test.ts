import { describe, expect, it } from "vitest";
import { CampaignAnalysisStore, MEMORY_LIMIT_ERROR } from "./analysisStore";
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

const save = (hash = "first", dateSort = 13600101, campaignId = "campaign"): SaveAnalysis => ({
  observation: {
    hash,
    dateSort,
    date: "1360-01-01",
    campaignId,
    version: "1.4.0",
    layoutKey: "same",
    fileName: "save.eu5",
    world: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
  },
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
  base.observation.layoutKey = layoutKey;
  base.projection = {
    ...base.projection,
    layoutKey,
    locationIds: Uint32Array.from([42, 43].slice(0, n)),
    fractions: new Uint16Array(n * 2),
    metrics: Float32Array.from(population.flatMap((p) => [0, p, 0, 0, 0, 0, 0])),
    owners: new Uint32Array(n),
    controllers: new Uint32Array(n),
    religions: new Uint32Array(n),
    markets: new Uint32Array(n),
  };
  base.tables = tables(countries, markets);
  return base;
}
it("appends in either order without copying old columns and shares compatible location IDs", () => {
  const store = new CampaignAnalysisStore(),
    later = save("later", 13600401),
    earlier = save();
  store.append(later);
  const before = store.mapFrame("later");
  store.append(earlier);
  expect(store.timeline("campaign").map((row) => row.hash)).toEqual(["first", "later"]);
  expect(store.mapFrame("first").locationIds).toBe(before.locationIds);
  expect(store.mapFrame("later").metrics).toBe(before.metrics);
});
it("deduplicates files and rejects alternate saves on the same date before changing the store", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  store.append(save());
  expect(store.timeline("campaign")).toHaveLength(1);
  expect(() => store.append(save("alternate"))).toThrow("already occupies");
  expect(store.timeline("campaign")).toHaveLength(1);
});
it("rejects incomplete columns and incompatible layouts", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  const broken = save("broken", 13600401);
  broken.projection.metrics = new Float32Array(1);
  expect(() => store.append(broken)).toThrow("Incomplete");
  const other = save("other", 13600401);
  other.projection.locationIds[0] = 77;
  expect(() => store.append(other)).toThrow("Incompatible");
});
it("counts shared buffers once and clears only the requested campaign", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  const bytes = store.memoryBytes();
  store.append(save("other", 13600401, "other"));
  expect(store.memoryBytes()).toBe(bytes * 2 - 4);
  store.clearCampaign("campaign");
  expect(store.memoryBytes()).toBe(bytes);
  expect(() => store.mapFrame("first")).toThrow("no longer available");
  expect(store.timeline("other")).toHaveLength(1);
  store.clearCampaign();
  expect(store.memoryBytes()).toBe(0);
});

it("rejects tables with a missing row or from a different version", () => {
  const store = new CampaignAnalysisStore();
  const broken = save();
  broken.tables = tables([{ id: 1, tag: "AAA", population: 1 }]);
  broken.tables.countryValues = new Float64Array(1);
  expect(() => store.append(broken)).toThrow("Incomplete snapshot tables");
  const other = save();
  other.tables.countryMetrics = ["population"];
  expect(() => store.append(other)).toThrow("different version");
  expect(store.timeline("campaign")).toHaveLength(0);
});

describe("queries", () => {
  // Country 0x0100_0007 takes the low bits of country 7 after country 7 ends.
  const reused = 0x0100_0007;
  const store = new CampaignAnalysisStore();
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
    const growing = new CampaignAnalysisStore();
    growing.append(campaignSave("x", 14000101, [1, 1], [{ id: 1, tag: "A", population: 1 }], []));
    const before = growing.countryHistory("campaign", { kind: "world" });
    growing.append(campaignSave("y", 14100101, [1, 1], [{ id: 1, tag: "A", population: 2 }], []));
    expect(before.snapshots).toBe(1);
    expect(before.rows).toHaveLength(1);
    expect(growing.countryHistory("campaign", { kind: "world" }).snapshots).toBe(2);
  });
});

it("refuses a save above the memory limit and keeps the store unchanged", () => {
  const first = save();
  const bytes = new CampaignAnalysisStore();
  bytes.append(save());
  const limit = bytes.memoryBytes() + 10;
  const store = new CampaignAnalysisStore(limit);
  store.append(first);
  let error: unknown;
  try {
    store.append(save("later", 13600401));
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).name).toBe(MEMORY_LIMIT_ERROR);
  expect((error as Error).message).toContain("Campaign analysis is full");
  expect(store.timeline("campaign")).toHaveLength(1);
  expect(store.memoryBytes()).toBe(bytes.memoryBytes());
});
