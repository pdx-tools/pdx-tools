import { expect, it } from "vitest";
import { Eu5CampaignAnalysis } from "./analysisStore";
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
    hash: `eu5:1:${hash}`,
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
  const { countries: _countries, markets: _markets, ...metadata } = snapshot;
  return {
    descriptor: {
      id: `eu5:1:${hash}`,
      game: "eu5",
      contentHash: hash,
      extractorVersion: 1,
      artifacts: ["observations", "map", "charts"],
      gameVersion: snapshot.version,
      countryNames: { 7: "England" },
      goods: ["grain"],
      ...metadata,
      layoutKey: "same",
      world: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
    },
    payload: {
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

      overviews: packOverviews({
        world: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
        control: { scope: { value: 123.45678912345679 } },
      } as unknown as OverviewData),
    },
  };
}
it("appends out of order without copying earlier column blocks and shares compatible layouts", () => {
  const store = new Eu5CampaignAnalysis(),
    later = save("later", 13600401),
    earlier = save();
  store.append(later);
  store.append(earlier);
  expect(store.timeline("campaign").map((row) => row.id)).toEqual(["eu5:1:one", "eu5:1:later"]);
  expect(store.mapFrame("eu5:1:one").projection.locationIds).toBe(
    store.mapFrame("eu5:1:later").projection.locationIds,
  );
  expect(store.mapFrame("eu5:1:later").projection.metrics).toBe(later.payload.projection.metrics);
  expect(store.timeline("campaign")[0]).not.toHaveProperty("countries");
});
it("deduplicates hashes, rejects alternative saves on one date, and isolates campaigns", () => {
  const store = new Eu5CampaignAnalysis();
  store.append(save());
  const bytes = store.store.memory().bufferBytes;
  store.append(save());
  expect(store.store.memory().bufferBytes).toBe(bytes);
  expect(() => store.append(save("different"))).toThrow("already occupies");
  store.append(save("other", 13600101, "other"));
  expect(store.timeline("campaign")).toHaveLength(1);
  expect(store.timeline("other")).toHaveLength(1);
});
it("resolves countries by stable ID across changing tags and preserves gaps", () => {
  const store = new Eu5CampaignAnalysis();
  store.append(save());
  const second = save("renamed", 13600401);
  second.payload.snapshot.strings[second.payload.snapshot.countryIds[0]] = "GBR";
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
  expect(store.resolveEntity("eu5:1:one", { kind: "country", id: 1 })).toEqual({
    kind: "country",
    id: 7,
  });
  expect(() => store.resolveEntity("eu5:1:one", { kind: "country", id: 0 })).toThrow(
    "Country is not present",
  );
});
it("answers overviews and exports independently of original files or disk", async () => {
  const store = new Eu5CampaignAnalysis();
  store.append(save());
  expect(store.queryOverview("eu5:1:one", "world")).toEqual({
    hash: "eu5:1:one",
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
  const store = new Eu5CampaignAnalysis();
  store.append(save());
  store.append(save("other", 13600101, "other"));
  store.store.clear("campaign");
  expect(() => store.mapFrame("eu5:1:one")).toThrow("no longer available");
  expect(store.timeline("other")).toHaveLength(1);
  store.store.clear();
  expect(store.store.memory().bufferBytes).toBe(0);
});
it("rejects malformed or incompatible columns before inserting them", () => {
  const store = new Eu5CampaignAnalysis();
  store.append(save());
  const bad = save("bad", 13600401);
  bad.payload.projection.locationIds[0] = 43;
  expect(() => store.append(bad)).toThrow("Incompatible");
  expect(store.timeline("campaign")).toHaveLength(1);
  const short = save("short", 13600401);
  short.payload.projection.metrics = new Float32Array(1);
  expect(() => store.append(short)).toThrow("Incomplete");
});

it("counts shared buffers once and releases them after the final campaign clears", () => {
  const store = new Eu5CampaignAnalysis();
  store.append(save());
  store.append(save("two", 13600101, "other"));
  const buffers = analyticalBuffers([store.mapFrame("eu5:1:one"), store.mapFrame("eu5:1:two")]);
  expect(store.store.memory().bufferBytes).toBeGreaterThanOrEqual(
    buffers.reduce((sum, b) => sum + b.byteLength, 0),
  );
  const before = store.store.memory().bufferBytes;
  store.store.clear("campaign");
  expect(store.store.memory().bufferBytes).toBeLessThan(before);
  expect(store.mapFrame("eu5:1:two").projection.locationIds).toHaveLength(1);
  store.store.clear("other");
  expect(store.store.memory().bufferBytes).toBe(0);
});
it("does not copy selector metadata with map frames or selected history results", () => {
  const store = new Eu5CampaignAnalysis();
  store.append(save());
  expect(store.mapFrame("eu5:1:one")).not.toHaveProperty("countryNames");
  const rows = store.queryHistory({ campaignId: "campaign", country: "world" });
  expect(rows[0]).not.toHaveProperty("countryNames");
  expect(rows[0]).not.toHaveProperty("goods");
});

it("never merges historical series when a different country reuses the old tag", () => {
  const store = new Eu5CampaignAnalysis();
  const first = save(),
    later = save("later", 13600401);
  later.payload.snapshot.countryIds[2] = 99;
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

it("enforces the shared resident budget for chart buffers as well as maps", () => {
  const candidate = save();
  const mapBytes = analyticalBuffers(candidate.payload.projection).reduce(
    (total, buffer) => total + buffer.byteLength,
    0,
  );
  const store = new Eu5CampaignAnalysis(mapBytes);
  expect(() => store.append(candidate)).toThrow("Campaign analysis is full");
  expect(store.store.memory()).toMatchObject({ snapshots: 0, bufferBytes: 0, layouts: 0 });
});

it("rejects analytical metadata from a different observation before storing columns", () => {
  const store = new Eu5CampaignAnalysis();
  const candidate = save();
  candidate.payload.snapshot.hash = "eu5:1:other";
  expect(() => store.append(candidate)).toThrow("does not match descriptor");
  expect(store.store.memory().snapshots).toBe(0);
});

it("rejects unsupported extractor versions through the shared resident store", () => {
  const store = new Eu5CampaignAnalysis();
  const candidate = save();
  candidate.descriptor.extractorVersion = 2;
  expect(() => store.append(candidate)).toThrow("extractor 1");
  expect(store.store.memory().bufferBytes).toBe(0);
});
