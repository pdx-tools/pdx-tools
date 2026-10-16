import { expect, it } from "vitest";
import { currentHistorySnapshot } from "./currentSnapshot";
import type { Snapshot } from "./types";

const file = new File(["save"], "observer.eu5", { lastModified: 100 });
const snapshots = ["first", "active"].map((hash) => ({
  hash,
  campaignId: "campaign",
  version: "1.4",
  dateSort: 13600101,
})) as Snapshot[];
const current = {
  campaignId: "campaign",
  version: "1.4",
  dateSort: 13600101,
  remote: false,
  file,
  source: { hash: "active", version: { size: file.size, lastModified: file.lastModified } },
};

it("chooses the active source hash instead of the first observation on the same date", () => {
  expect(currentHistorySnapshot(snapshots, current)).toBe(snapshots[1]);
});

it("does not pin stale observations after a file handle is overwritten on the same date", () => {
  const replacement = new File(["changed save"], file.name, { lastModified: 200 });
  expect(currentHistorySnapshot(snapshots, { ...current, file: replacement })).toBeUndefined();
  expect(currentHistorySnapshot(snapshots, { ...current, source: undefined })).toBeUndefined();
});

it("leaves ambiguous remote observations unselected and requires matching campaign and version", () => {
  const remote = { ...current, remote: true, source: undefined, file: undefined };
  expect(currentHistorySnapshot(snapshots, remote)).toBeUndefined();
  expect(currentHistorySnapshot([snapshots[0]], remote)).toBe(snapshots[0]);
  expect(currentHistorySnapshot(snapshots, { ...current, version: "1.0" })).toBeUndefined();
  expect(currentHistorySnapshot(snapshots, { ...current, campaignId: "other" })).toBeUndefined();
  expect(currentHistorySnapshot(snapshots, { ...current, dateSort: 13600401 })).toBeUndefined();
});
