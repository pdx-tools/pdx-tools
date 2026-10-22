import { describe, expect, it } from "vitest";
import { snapshotId } from "./descriptor";
import type { SnapshotDescriptor } from "./descriptor";
import { MEMORY_LIMIT_ERROR, ResidentStore } from "./residentStore";
import type { PayloadAdapter } from "./residentStore";

// A game-neutral payload: one value for each geographic ID.
type Payload = {
  layoutKey: string;
  ids: Uint32Array<ArrayBuffer>;
  values: Float64Array<ArrayBuffer>;
};
const adapter: PayloadAdapter<SnapshotDescriptor, Payload> = {
  game: "test",
  extractorVersion: 3,
  validate: (_descriptor, payload) => {
    if (payload.values.length !== payload.ids.length) throw Error("Incomplete columns");
  },
  layouts: (payload) => [{ key: payload.layoutKey, ids: payload.ids }],
  useLayout: (payload, _key, ids) => {
    payload.ids = ids;
  },
};

const descriptor = (
  contentHash: string,
  dateSort = 13600101,
  campaignId = "campaign",
): SnapshotDescriptor => ({
  id: snapshotId("test", 3, contentHash),
  game: "test",
  campaignId,
  contentHash,
  date: String(dateSort),
  dateSort,
  gameVersion: "1.0",
  extractorVersion: 3,
  artifacts: ["observations"],
});
const payload = (layoutKey = "layout", ids = [42, 43]): Payload => ({
  layoutKey,
  ids: Uint32Array.from(ids),
  values: Float64Array.from(ids, (id) => id * 10),
});
// One snapshot keeps 8 bytes of IDs and 16 bytes of values.
const IDS = 8;
const VALUES = 16;

describe("append", () => {
  it("appends in either order without copying earlier blocks", () => {
    const store = new ResidentStore(adapter);
    const later = payload();
    store.append(descriptor("later", 13600401), later);
    store.append(descriptor("first"), payload());
    expect(store.timeline("campaign").map((row) => row.contentHash)).toEqual(["first", "later"]);
    expect(store.read(snapshotId("test", 3, "later")).payload).toBe(later);
    expect(store.read(snapshotId("test", 3, "later")).payload.values).toBe(later.values);
  });

  it("keeps one copy of equal layouts, and counts each buffer once", () => {
    const store = new ResidentStore(adapter);
    const first = payload();
    store.append(descriptor("first"), first);
    expect(store.memory().bufferBytes).toBe(IDS + VALUES);
    const second = payload();
    store.append(descriptor("second", 13600401), second);
    expect(second.ids).toBe(first.ids);
    expect(store.memory()).toMatchObject({ bufferBytes: IDS + VALUES * 2, layouts: 1 });
  });

  it("does not copy or count a duplicate", () => {
    const store = new ResidentStore(adapter);
    const kept = payload();
    store.append(descriptor("first"), kept);
    const before = store.memory();
    const result = store.append(descriptor("first"), payload());
    expect(result.duplicate).toBe(true);
    expect(store.memory()).toEqual(before);
    expect(store.read(result.descriptor.id).payload).toBe(kept);
  });

  it("refuses each invalid append and leaves the store unchanged", () => {
    const store = new ResidentStore(adapter);
    store.append(descriptor("first"), payload());
    const before = store.memory();
    // The limit has room for one more snapshot with a shared layout.
    const limit = before.bufferBytes + VALUES;
    const refusals: [SnapshotDescriptor, Payload, string][] = [
      [descriptor("alternate"), payload(), "already occupies"],
      [{ ...descriptor("x", 13600401), game: "other" }, payload(), "accepts test snapshots"],
      [{ ...descriptor("x", 13600401), extractorVersion: 2 }, payload(), "extractor 3"],
      [{ ...descriptor("x", 13600401), id: "x" }, payload(), "Invalid snapshot descriptor"],
      [{ ...descriptor("x", 13600401), campaignId: "" }, payload(), "Invalid snapshot descriptor"],
      [descriptor("x", 13600401), { ...payload(), values: new Float64Array(1) }, "Incomplete"],
      [descriptor("x", 13600401), payload("layout", [42, 44]), "Incompatible"],
      // A new layout adds its IDs, so it does not fit.
      [descriptor("x", 13600401), payload("other"), "Campaign analysis is full"],
    ];
    for (const [row, data, message] of refusals) {
      expect(() => store.append(row, data, limit)).toThrow(message);
      expect(store.memory()).toEqual(before);
      expect(store.timeline("campaign")).toHaveLength(1);
    }
    expect(() => store.append(descriptor("x", 13600401), payload("other"), limit)).toThrow(
      expect.objectContaining({ name: MEMORY_LIMIT_ERROR }),
    );
    // A shared layout adds only the values, so this fits.
    store.append(descriptor("x", 13600401), payload(), limit);
    expect(store.memory().bufferBytes).toBe(IDS + VALUES * 2);
    // A duplicate adds nothing, so it fits in any limit.
    expect(store.append(descriptor("x", 13600401), payload(), 0).duplicate).toBe(true);
  });
});

describe("clear", () => {
  it("releases one campaign and keeps the others", () => {
    const store = new ResidentStore(adapter);
    store.append(descriptor("a"), payload());
    store.append(descriptor("b", 13600401), payload("other"));
    store.append(descriptor("c", 13600101, "second"), payload());
    store.clear("campaign");
    expect(store.timeline("campaign")).toEqual([]);
    expect(store.timeline("second")).toHaveLength(1);
    expect(() => store.read(snapshotId("test", 3, "a"))).toThrow("no longer available");
    // The second campaign keeps the IDs that the first campaign added.
    expect(store.memory()).toMatchObject({ bufferBytes: IDS + VALUES, layouts: 1 });
    store.clear();
    expect(store.memory()).toEqual({
      bufferBytes: 0,
      snapshots: 0,
      layouts: 0,
    });
  });

  it("accepts a different save at a date after its campaign is cleared", () => {
    const store = new ResidentStore(adapter);
    store.append(descriptor("a"), payload());
    store.clear("campaign");
    expect(store.append(descriptor("b"), payload()).duplicate).toBe(false);
  });
});

it("returns a timeline that later appends do not change", () => {
  const store = new ResidentStore(adapter);
  store.append(descriptor("a"), payload());
  const timeline = store.timeline("campaign");
  store.append(descriptor("b", 13600401), payload());
  expect(timeline).toHaveLength(1);
  expect(store.timeline("campaign")).toHaveLength(2);
});

describe("adapter callbacks", () => {
  it("leave the store unchanged when one fails", () => {
    let fail = true;
    const store = new ResidentStore({
      ...adapter,
      layouts: (data) => {
        if (fail) throw Error("bad layouts");
        return adapter.layouts!(data);
      },
    });
    expect(() => store.append(descriptor("a"), payload())).toThrow("bad layouts");
    expect(store.memory()).toMatchObject({ bufferBytes: 0, layouts: 0, snapshots: 0 });
    // The failed snapshot left no layout, so other IDs under the same key are accepted.
    fail = false;
    store.append(descriptor("b"), payload("layout", [7]));
    expect(store.timeline("campaign")).toHaveLength(1);
  });

  it("count the buffers that the payload keeps when a layout is not replaced", () => {
    // The IDs are part of a larger buffer, so the payload keeps its own copy.
    const inline = (contentHash: string, campaignId: string) => {
      const ids = new Uint32Array([42, 43, 0, 0]).subarray(0, 2);
      return [descriptor(contentHash, 13600101, campaignId), { ...payload(), ids }] as const;
    };
    const store = new ResidentStore({ ...adapter, useLayout: undefined });
    store.append(...inline("a", "campaign"));
    store.append(...inline("b", "second"));
    expect(store.memory().bufferBytes).toBe(2 * (16 + VALUES));
    // The payload keeps its own IDs, so it needs more than the values.
    const limit = store.memory().bufferBytes + VALUES;
    expect(() => store.append(...inline("c", "third"), limit)).toThrow("Campaign analysis is full");
    // The layout keeps the IDs of the first snapshot after that snapshot goes.
    store.clear("campaign");
    expect(store.memory().bufferBytes).toBe(16 + 16 + VALUES);
    store.clear();
    expect(store.memory().bufferBytes).toBe(0);
  });
});
