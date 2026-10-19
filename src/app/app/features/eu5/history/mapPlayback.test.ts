import { expect, it } from "vitest";
import {
  compatibleMapFrames,
  nearestMapFrame,
  publishedMapFrames,
  mapTimelineBounds,
} from "./mapPlayback";
import type { MapFrame } from "./analysisTypes";
import type { SnapshotMetadata } from "./types";
const frame = (
  dateSort: number,
  hash = String(dateSort),
  campaignId = "campaign",
  layoutKey = "layout",
) =>
  ({
    world: { locationCount: 1, countryCount: 1, totalPopulation: 1 },
    dateSort,
    hash,
    campaignId,
    layoutKey,
  }) as MapFrame;

it("isolates campaign and map layouts while keeping one deterministic observation per date", () => {
  const a = frame(13600101, "a");
  const b = frame(13600401, "b");
  expect(
    compatibleMapFrames(
      [
        b,
        frame(13600101, "z"),
        a,
        frame(13610101, "c", "other"),
        frame(13610101, "d", "campaign", "other"),
      ],
      "campaign",
      "layout",
    ),
  ).toEqual([frame(13600101, "z"), b]);
});
it("snaps arbitrary scrubbing to observed dates, including campaign ends", () => {
  const frames = [frame(13600101), frame(13600401), frame(13601001)];
  expect(nearestMapFrame(frames, { year: 1359, month: 1, day: 1 })).toBe(0);
  expect(nearestMapFrame(frames, { year: 1360, month: 3, day: 1 })).toBe(1);
  expect(nearestMapFrame(frames, { year: 1361, month: 1, day: 1 })).toBe(2);
});

it("publishes completed observations during import without retaining duplicated display metadata", () => {
  const snapshot = {
    ...frame(13600401),
    date: "1360-04-01",
    version: "1.4.0",
    countryNames: { "1": "A country" },
    marketLabels: { "1": "A market" },
  } as unknown as SnapshotMetadata;
  const frames = publishedMapFrames([snapshot], "campaign", "layout");
  expect(frames).toEqual([
    {
      hash: "13600401",
      campaignId: "campaign",
      layoutKey: "layout",
      fileName: undefined,
      world: { locationCount: 1, countryCount: 1, totalPopulation: 1 },
      date: "1360-04-01",
      dateSort: 13600401,
      version: "1.4.0",
    },
  ]);
  expect(publishedMapFrames([snapshot], "campaign", "incompatible")).toEqual([]);
  expect(publishedMapFrames([snapshot], "other", "layout")).toEqual([]);
});

it("keeps pending dates in the timeline range before any analysis completes", () => {
  const current = { year: 1360, month: 4, day: 1 };
  const early = { year: 1350, month: 1, day: 1 };
  const late = { year: 1370, month: 1, day: 1 };
  expect(mapTimelineBounds(current, [], [late, early])).toEqual({ start: early, end: late });
  expect(mapTimelineBounds(current, [frame(13600401)], [late, early])).toEqual({
    start: early,
    end: late,
  });
  expect(mapTimelineBounds(current, [], [])).toEqual({ start: current, end: current });
});
