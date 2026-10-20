import { expect, it } from "vitest";
import {
  compatibleMapFrames,
  nearestMapFrame,
  publishedMapFrames,
  mapTimelineBounds,
} from "./mapPlayback";
import type { Eu5SnapshotDescriptor } from "./analysisTypes";
const frame = (
  dateSort: number,
  id = String(dateSort),
  campaignId = "campaign",
  layoutKey = "layout",
  artifacts = ["observations", "map"],
) =>
  ({
    dateSort,
    id,
    campaignId,
    layoutKey,
    artifacts,
  }) as unknown as Eu5SnapshotDescriptor;

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

it("publishes the snapshots that have a map of the campaign and layout, without a copy", () => {
  const snapshot = frame(13600401);
  const [published] = publishedMapFrames([snapshot], "campaign", "layout");
  expect(published).toBe(snapshot);
  expect(publishedMapFrames([snapshot], "campaign", "incompatible")).toEqual([]);
  expect(publishedMapFrames([snapshot], "other", "layout")).toEqual([]);
  const noMap = frame(13600401, "x", "campaign", "layout", ["observations"]);
  expect(publishedMapFrames([noMap], "campaign", "layout")).toEqual([]);
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
