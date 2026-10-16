import { expect, it } from "vitest";
import { CampaignAnalysisStore } from "./analysisStore";
import { packSnapshot } from "./packedSnapshot";
import { analyticalBuffers, packOverviews } from "./packedOverview";
import type { SaveAnalysis } from "./analysisTypes";
import type { OverviewData } from "@/wasm/wasm_eu5";
import type { Snapshot } from "./types";
function save(hash = "one", dateSort = 13600101, campaignId = "campaign"): SaveAnalysis {
  const country = {
    countryId: 7,
    tag: "ENG",
    population: 10.12345678912345,
    development: 12,
    locations: 1,
    wealth: 3,
    tax: 2,
    effectiveDevelopment: 9,
    stateCapacity: 90,
    births: 1,
    ruralPopulation: 5,
    urbanPopulation: 5,
    rgoLevels: 2,
    buildingLevels: 3,
    buildingEmployment: 4,
    income: 5,
    greatPowerRank: 1,
    religions: new Map([["catholic", 10]]),
    materials: new Map([["grain", 2]]),
    buildings: new Map([["farm", 3]]),
    marketCenters: [42],
  };
  const snapshot: Snapshot = {
    hash,
    dateSort,
    date: "1360-01-01",
    campaignId,
    version: "1.4.0",
    fileName: "save.eu5",
    marketLabels: { 42: "London" },
    countries: [country],
    markets: [
      {
        marketId: 4,
        center: 42,
        centerName: "London",
        good: "grain",
        price: 1.12345678912345,
        supply: 2,
        demand: 3,
        stockpile: undefined,
      },
    ],
    population: country.population,
    development: 12,
  };
  return {
    observation: {
      ...snapshot,
      layoutKey: "same",
      world: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
    },
    snapshot: packSnapshot(snapshot),
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
    countryIds: new Uint32Array([0, 7]),
    countryNames: { 7: "England" },
    overviews: packOverviews({
      world: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
      control: { scope: { value: 123.45678912345679 } },
    } as unknown as OverviewData),
  };
}
it("appends out of order without copying earlier column blocks and shares compatible layouts", () => {
  const store = new CampaignAnalysisStore(),
    later = save("later", 13600401),
    earlier = save();
  store.append(later);
  store.append(earlier);
  expect(store.timeline("campaign").map((row) => row.hash)).toEqual(["one", "later"]);
  expect(store.mapFrame("one").locationIds).toBe(store.mapFrame("later").locationIds);
  expect(store.mapFrame("later").metrics).toBe(later.projection.metrics);
  expect(store.timeline("campaign")[0]).not.toHaveProperty("countries");
});
it("deduplicates hashes, rejects alternative saves on one date, and isolates campaigns", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  const bytes = store.memoryBytes();
  store.append(save());
  expect(store.memoryBytes()).toBe(bytes);
  expect(() => store.append(save("different"))).toThrow("already occupies");
  store.append(save("other", 13600101, "other"));
  expect(store.timeline("campaign")).toHaveLength(1);
  expect(store.timeline("other")).toHaveLength(1);
});
it("resolves countries by stable ID across changing tags and preserves gaps", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  const second = save("renamed", 13600401);
  second.snapshot.strings[second.snapshot.countryIds[0]] = "GBR";
  store.append(second);
  const dates = store.queryHistory({
    campaignId: "campaign",
    country: "id:7",
    good: "grain",
    centers: [42],
  });
  expect(dates.map((row) => row.countries[0].tag)).toEqual(["ENG", "GBR"]);
  expect(dates[1].countries[0].population).toBe(10.12345678912345);
  expect(dates[1].markets[0].stockpile).toBeUndefined();
  expect(store.queryHistory({ campaignId: "campaign", country: "id:99" })[0].countries).toEqual([]);
  expect(store.resolveEntity("one", { kind: "country", id: 1 })).toEqual({
    kind: "country",
    id: 7,
  });
  expect(() => store.resolveEntity("one", { kind: "country", id: 0 })).toThrow(
    "Country is not present",
  );
});
it("answers overviews and exports independently of original files or disk", async () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  expect(store.queryOverview("one", "world")).toEqual({
    hash: "one",
    data: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
  });
  const exported = JSON.parse(await store.exportObservations("campaign").text());
  expect(exported.snapshots[0].countries[0].population).toBe(10.12345678912345);
  expect(
    store
      .queryHistory({ campaignId: "campaign", country: "world" })[0]
      .countries[0].religions.get("catholic"),
  ).toBe(10);
});
it("clears campaign allocations without deleting another campaign", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  store.append(save("other", 13600101, "other"));
  store.clearCampaign("campaign");
  expect(() => store.mapFrame("one")).toThrow("no longer available");
  expect(store.timeline("other")).toHaveLength(1);
  store.clearCampaign();
  expect(store.memoryBytes()).toBe(0);
});
it("rejects malformed or incompatible columns before inserting them", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  const bad = save("bad", 13600401);
  bad.projection.locationIds[0] = 43;
  expect(() => store.append(bad)).toThrow("Incompatible");
  expect(store.timeline("campaign")).toHaveLength(1);
  const short = save("short", 13600401);
  short.projection.metrics = new Float32Array(1);
  expect(() => store.append(short)).toThrow("Incomplete");
});

it("counts shared buffers once and releases them after the final campaign clears", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  store.append(save("two", 13600101, "other"));
  const buffers = analyticalBuffers([store.mapFrame("one"), store.mapFrame("two")]);
  expect(store.memoryBytes()).toBeGreaterThanOrEqual(
    buffers.reduce((sum, b) => sum + b.byteLength, 0),
  );
  const before = store.memoryBytes();
  store.clearCampaign("campaign");
  expect(store.memoryBytes()).toBeLessThan(before);
  expect(store.mapFrame("two").locationIds).toHaveLength(1);
  store.clearCampaign("other");
  expect(store.memoryBytes()).toBe(0);
});
it("does not copy selector metadata with map frames or selected history results", () => {
  const store = new CampaignAnalysisStore();
  store.append(save());
  expect(store.mapFrame("one")).not.toHaveProperty("countryNames");
  const rows = store.queryHistory({ campaignId: "campaign", country: "world" });
  expect(rows[0]).not.toHaveProperty("countryNames");
  expect(rows[0]).not.toHaveProperty("goods");
});

it("never merges historical series when a different country reuses the old tag", () => {
  const store = new CampaignAnalysisStore();
  const first = save(),
    later = save("later", 13600401);
  later.snapshot.countryIds[2] = 99;
  store.append(first);
  store.append(later);
  expect(
    store
      .queryHistory({ campaignId: "campaign", country: "id:7" })
      .map((row) => row.countries.length),
  ).toEqual([1, 0]);
  expect(
    store
      .queryHistory({ campaignId: "campaign", country: "id:99" })
      .map((row) => row.countries.length),
  ).toEqual([0, 1]);
  expect(
    store
      .queryHistory({ campaignId: "campaign", country: "ENG" })
      .every((row) => !row.countries.length),
  ).toBe(true);
});
