import { expect, it } from "vitest";
import { snapshotId } from "@/features/campaign/analysis/descriptor";
import { Eu5CampaignAnalysis } from "./analysisStore";
import type { SaveAnalysis } from "./analysisTypes";

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
  },
});

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
