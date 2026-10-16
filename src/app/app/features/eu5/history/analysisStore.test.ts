import { expect, it } from "vitest";
import { CampaignAnalysisStore } from "./analysisStore";
import type { SaveAnalysis } from "./analysisTypes";
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
});
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
