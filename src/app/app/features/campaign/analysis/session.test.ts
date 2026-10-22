import { expect, it } from "vitest";
import { snapshotId } from "./descriptor";
import type { SnapshotDescriptor } from "./descriptor";
import { STALE_GENERATION_ERROR, sessionApi } from "./session";
import type { AnalysisStore, QueryContext } from "./session";

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
  payload: null,
});

/** The Rust store keeps one campaign. This one keeps the descriptors. */
function fakeStore(): AnalysisStore<SnapshotDescriptor, null> & { rows: SnapshotDescriptor[] } {
  const rows: SnapshotDescriptor[] = [];
  return {
    rows,
    append: (descriptor) => {
      const existing = rows.find((row) => row.id === descriptor.id);
      if (!existing) rows.push(descriptor);
      return { descriptor: existing ?? descriptor, duplicate: !!existing };
    },
    clear: () => void rows.splice(0),
    campaign: () => rows[0]?.campaignId,
    memory: () => ({ bufferBytes: rows.length, snapshots: rows.length, layouts: 0, indexBytes: 0 }),
    select: (campaignId, selection) =>
      rows
        .filter((row) => row.campaignId === campaignId)
        .filter((row) => selection.kind === "all" || selection.ids.includes(row.id))
        .map((row) => row.id),
  };
}

type Store = ReturnType<typeof fakeStore>;
const handlers = {
  count: ({ store, campaignId }: QueryContext<Store>, _args: null) =>
    store.rows.filter((row) => row.campaignId === campaignId).length,
};

function session() {
  const store = fakeStore();
  const api = sessionApi(Promise.resolve(store), handlers, () => 65536);
  return { store, api };
}

it("refuses an append from an import that started before a clear", async () => {
  const { store, api } = session();
  await api.append(0, snapshot("first"), Infinity);
  await api.clear(1, "campaign");
  await expect(api.append(0, snapshot("late"), Infinity)).rejects.toMatchObject({
    name: STALE_GENERATION_ERROR,
  });
  expect(store.rows).toEqual([]);
  expect((await api.append(1, snapshot("late"), Infinity)).memory).toMatchObject({
    snapshots: 1,
    wasmBytes: 65536,
  });
});

it("keeps the campaign on a clear of another campaign, but ends the generation", async () => {
  const { store, api } = session();
  await api.append(0, snapshot("first"), Infinity);
  await api.clear(1, "other");
  expect(store.rows).toHaveLength(1);
  await expect(api.append(0, snapshot("second"), Infinity)).rejects.toMatchObject({
    name: STALE_GENERATION_ERROR,
  });
});

it("takes the generation of a new worker from open", async () => {
  const { api } = session();
  await api.open(4);
  await expect(api.append(0, snapshot("first"), Infinity)).rejects.toMatchObject({
    name: STALE_GENERATION_ERROR,
  });
  expect((await api.append(4, snapshot("first"), Infinity)).duplicate).toBe(false);
});

it("answers a query with the snapshots that it read, and reports other outcomes", async () => {
  const { api } = session();
  await api.append(0, snapshot("a"), Infinity);
  await api.append(0, snapshot("b"), Infinity);
  const request = {
    generation: 0,
    campaignId: "campaign",
    selection: { kind: "ids" as const, ids: [snapshotId("test", 1, "b")] },
    identity: "count",
    sequence: 1,
    query: { kind: "count" as const, args: null },
  };
  expect(await api.query(request)).toEqual({
    generation: 0,
    identity: "count",
    sequence: 1,
    snapshotIds: [snapshotId("test", 1, "b")],
    outcome: { status: "ok", value: 2 },
  });
  expect((await api.query({ ...request, generation: 5 })).outcome).toEqual({ status: "stale" });
  const unsupported = { ...request, query: { kind: "other", args: null } as never };
  expect((await api.query(unsupported)).outcome).toEqual({
    status: "unsupported",
    kind: "other",
  });
});
