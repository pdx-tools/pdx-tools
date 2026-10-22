import { expect, it } from "vitest";
import { snapshotId } from "./descriptor";
import type { SnapshotDescriptor } from "./descriptor";
import { ResidentStore } from "./residentStore";
import { STALE_GENERATION_ERROR, sessionApi } from "./session";

type Payload = { values: Float64Array<ArrayBuffer> };

const snapshot = (contentHash: string, campaignId = "campaign") => ({
  descriptor: {
    id: snapshotId("test", 1, contentHash),
    game: "test",
    campaignId,
    contentHash,
    date: "1444-11-11",
    dateSort: 14441111,
    gameVersion: "1.0",
    extractorVersion: 1,
    artifacts: [],
  } satisfies SnapshotDescriptor,
  payload: { values: new Float64Array(2) },
});

function session() {
  const store = new ResidentStore<SnapshotDescriptor, Payload>({
    game: "test",
    extractorVersion: 1,
    validate: () => {},
  });
  return { store, api: sessionApi(store) };
}

it("refuses an append from an import that started before a clear", () => {
  const { store, api } = session();
  api.append(0, snapshot("first"), Infinity);
  api.clear(1, "campaign");
  expect(() => api.append(0, snapshot("late"), Infinity)).toThrow(
    expect.objectContaining({ name: STALE_GENERATION_ERROR }),
  );
  expect(store.timeline("campaign")).toEqual([]);
  expect(api.append(1, snapshot("late"), Infinity).memory.snapshots).toBe(1);
});

it("refuses an append from before a clear of another campaign", () => {
  const { store, api } = session();
  api.clear(1, "other");
  expect(() => api.append(0, snapshot("first"), Infinity)).toThrow(
    expect.objectContaining({ name: STALE_GENERATION_ERROR }),
  );
  expect(store.timeline("campaign")).toEqual([]);
});

it("takes the generation of a new worker from open", () => {
  const { api } = session();
  api.open(4);
  expect(() => api.append(0, snapshot("first"), Infinity)).toThrow(
    expect.objectContaining({ name: STALE_GENERATION_ERROR }),
  );
  expect(api.append(4, snapshot("first"), Infinity).duplicate).toBe(false);
});
