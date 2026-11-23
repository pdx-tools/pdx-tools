import { afterEach, expect, it, vi } from "vitest";
import type { KeptPoint } from "./campaignStore";
import { campaignStoreApi } from "./campaignStoreWorker";
import { MEMORY_LIMIT_ERROR } from "./session";
import type { AnalysisStore } from "./session";

/** A browser's private files, in memory. */
class Dir {
  dirs = new Map<string, Dir>();
  files = new Map<string, Uint8Array>();
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (!this.dirs.has(name)) {
      if (!options?.create) throw new DOMException("missing", "NotFoundError");
      this.dirs.set(name, new Dir());
    }
    return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create) throw new DOMException("missing", "NotFoundError");
      this.files.set(name, new Uint8Array());
    }
    const files = this.files;
    return {
      getFile: async () => new File([files.get(name)!.slice()], name),
      createSyncAccessHandle: async () => ({
        truncate: () => files.set(name, new Uint8Array()),
        write: (bytes: Uint8Array) => {
          if (full(name)) throw new DOMException("full", "QuotaExceededError");
          return files.set(name, bytes.slice()).size;
        },
        flush: () => {},
        close: () => {},
      }),
    };
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name) && !this.dirs.delete(name))
      throw new DOMException("missing", "NotFoundError");
  }
}

let root = new Dir();
let quota = 1e9;
/** The files whose writes the browser refuses, though its estimate had room. */
let full = (_name: string) => false;
vi.stubGlobal("navigator", {
  storage: {
    getDirectory: async () => root,
    estimate: async () => ({ quota, usage: 0 }),
  },
});
afterEach(() => {
  root = new Dir();
  quota = 1e9;
  full = () => false;
});

/** An analysis store whose snapshot of a point is its ID, ten bytes long. */
function fakeStore() {
  const held = new Set<string>();
  const store = {
    append: (_generation: number, data: Uint8Array) => {
      const id = new TextDecoder().decode(data).trim();
      held.add(id);
      return { descriptor: { id }, duplicate: false, memory: {} };
    },
    snapshot: (id: string) => {
      if (!held.has(id)) throw Error("not held");
      return { descriptor: { id }, data: new TextEncoder().encode(id.padEnd(10)) };
    },
    encoder: () => 257,
    memory: () => ({ bufferBytes: 0 }),
  };
  return { store: store as unknown as AnalysisStore, held };
}

const point = (id: string, seq: number): KeptPoint => ({
  id,
  seq,
  date: { year: 1500 + seq, month: 1, day: 1 },
  parent: null,
  session: null,
  source: { kind: "dropped", name: `${id}.eu4` },
  sourceKeys: [],
});
const request = (...points: KeptPoint[]) => ({ nextSeq: points.length, sessions: [], points });
const snaps = () => [...root.dirs.get("campaigns")!.dirs.get("c")!.dirs.get("snap")!.files.keys()];

it("keeps its points between visits, within the bound, and mends a lost one", async () => {
  const first = fakeStore();
  first.held.add("a").add("b");
  const visit1 = campaignStoreApi(Promise.resolve(first.store), "eu4");
  expect((await visit1.restore(1, "c", 100)).status).toBe("none");
  expect(await visit1.persist("c", request(point("a", 0), point("b", 1)), 20)).toMatchObject({
    status: "written",
    kept: 2,
    missing: 0,
  });

  // The browser lost the figures of b.
  await root.dirs.get("campaigns")!.dirs.get("c")!.dirs.get("snap")!.removeEntry("b.gz");
  const second = fakeStore();
  const visit2 = campaignStoreApi(Promise.resolve(second.store), "eu4");
  const restored = await visit2.restore(1, "c", 100);
  expect(restored).toMatchObject({ status: "ok", missing: ["b"] });
  expect(second.held).toEqual(new Set(["a"]));

  // At the bound, a new earlier save does not push out what is kept; b keeps its place.
  second.held.add("e");
  const early = { ...point("e", 2), date: { year: 1400, month: 1, day: 1 } };
  expect(await visit2.persist("c", request(early, point("a", 0)), 20)).toMatchObject({
    status: "full",
    kept: 2,
    missing: 1,
  });
  expect(snaps()).toEqual(["a.gz"]);

  // The player drops b again, after e was refused: b keeps its place and is mended, e stays out.
  second.held.add("b");
  const again = await visit2.persist("c", request(point("a", 0), early, point("b", 3)), 20);
  expect(again).toMatchObject({ status: "full", missing: 0 });
  expect(again.status !== "readOnly" && again.ids.sort()).toEqual(["a", "b"]);
  expect(snaps().sort()).toEqual(["a.gz", "b.gz"]);
  const third = fakeStore();
  const visit3 = campaignStoreApi(Promise.resolve(third.store), "eu4");
  expect(await visit3.restore(1, "c", 100)).toMatchObject({ status: "ok", missing: [] });
  expect(third.held).toEqual(new Set(["a", "b"]));
});

it("never writes over kept points that it could not read", async () => {
  const { store } = fakeStore();
  const api = campaignStoreApi(Promise.resolve(store), "eu4");
  // Nothing kept yet: no folder until there is a point to keep.
  await api.restore(1, "c", 100);
  await api.persist("c", request(), 20);
  expect(root.dirs.has("campaigns")).toBe(false);

  // Storage trouble that is not a missing folder is a failed load.
  const broken = new Dir();
  broken.getDirectoryHandle = async () => {
    throw new DOMException("disk", "UnknownError");
  };
  root = broken;
  const visit = campaignStoreApi(Promise.resolve(store), "eu4");
  expect((await visit.restore(1, "c", 100)).status).toBe("unreadable");
  expect(await visit.persist("c", request(point("a", 0)), 20)).toEqual({ status: "readOnly" });
});

it("writes the points that fit in the browser's quota, and stops at the first that doesn't", async () => {
  const { store, held } = fakeStore();
  held.add("a").add("b").add("c");
  const snapshot = vi.spyOn(store, "snapshot");
  const api = campaignStoreApi(Promise.resolve(store), "eu4");
  await api.restore(1, "c", 100);
  // Room for about one gzipped point.
  quota = 40;
  const reply = await api.persist("c", request(point("a", 0), point("b", 1), point("c", 2)), 100);
  expect(reply).toMatchObject({ status: "full", kept: 1 });
  expect(snaps()).toEqual(["a.gz"]);
  // b did not fit, so c was not read or compressed.
  expect(snapshot.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
});

it("keeps the last index when the browser refuses a write that the estimate allowed", async () => {
  const { store, held } = fakeStore();
  held.add("a").add("b");
  const api = campaignStoreApi(Promise.resolve(store), "eu4");
  await api.restore(1, "c", 100);
  await api.persist("c", request(point("a", 0)), 100);
  full = (name) => name.startsWith("index-");
  const reply = await api.persist("c", request(point("a", 0), point("b", 1)), 100);
  expect(reply).toEqual({ status: "full", kept: 1, ids: ["a"], missing: 0 });
  // b's figures left with the index that would have named them.
  expect(snaps()).toEqual(["a.gz"]);
  full = () => false;
  const next = campaignStoreApi(Promise.resolve(fakeStore().store), "eu4");
  expect(await next.restore(1, "c", 100)).toMatchObject({ status: "ok", missing: [] });
});

it("keeps the watch run of kept points that the load could not add", async () => {
  const { store, held } = fakeStore();
  held.add("a").add("w");
  const api = campaignStoreApi(Promise.resolve(store), "eu4");
  await api.restore(1, "c", 100);
  const watched = { ...point("w", 1), session: "s" };
  await api.persist(
    "c",
    {
      ...request(point("a", 0), watched),
      sessions: [{ id: "s", fileName: "autosave.eu4", startedSeq: 1 }],
    },
    100,
  );
  // The figures of the run's point are lost, so the next visit can't add it.
  await root.dirs.get("campaigns")!.dirs.get("c")!.dirs.get("snap")!.removeEntry("w.gz");
  const next = fakeStore();
  const visit = campaignStoreApi(Promise.resolve(next.store), "eu4");
  await visit.restore(1, "c", 100);
  next.held.add("b");
  await visit.persist("c", request(point("a", 0), point("b", 2)), 100);
  const dir = root.dirs.get("campaigns")!.dirs.get("c")!;
  const index = JSON.parse(new TextDecoder().decode(dir.files.get("index-a.json")));
  expect(index.sessions).toEqual([{ id: "s", fileName: "autosave.eu4", startedSeq: 1 }]);
  expect(index.points.map((x: { id: string }) => x.id).sort()).toEqual(["a", "b", "w"]);
});

it("leaves the figures that the bound left out on disk as they are", async () => {
  const first = fakeStore();
  first.held.add("a").add("b");
  const visit1 = campaignStoreApi(Promise.resolve(first.store), "eu4");
  await visit1.restore(1, "c", 100);
  await visit1.persist("c", request(point("a", 0), point("b", 1)), 100);

  // The next visit's memory has room for a only.
  const second = fakeStore();
  const append = second.store.append.bind(second.store);
  second.store.append = (generation, data, limit) => {
    if (new TextDecoder().decode(data).trim() === "b")
      throw Object.assign(Error("full"), { name: MEMORY_LIMIT_ERROR });
    return append(generation, data, limit);
  };
  const visit2 = campaignStoreApi(Promise.resolve(second.store), "eu4");
  expect(await visit2.restore(1, "c", 100)).toMatchObject({ full: true, missing: [] });
  // b is back in memory, and the browser refuses any write of its figures.
  second.held.add("b");
  full = (name) => name === "b.gz";
  await visit2.persist("c", request(point("a", 0), point("b", 1)), 100);
  full = () => false;
  expect(snaps().sort()).toEqual(["a.gz", "b.gz"]);
  const third = fakeStore();
  await campaignStoreApi(Promise.resolve(third.store), "eu4").restore(1, "c", 100);
  expect(third.held).toEqual(new Set(["a", "b"]));
});

it("keeps the index's order, so opening a campaign at the bound changes nothing", async () => {
  const first = fakeStore();
  first.held.add("a").add("b");
  const visit1 = campaignStoreApi(Promise.resolve(first.store), "eu4");
  await visit1.restore(1, "c", 100);
  await visit1.persist("c", request(point("a", 0), point("b", 1)), 100);
  // Each later visit has memory for one point: the first in the index.
  const bounded = () => {
    const next = fakeStore();
    const append = next.store.append.bind(next.store);
    next.store.append = (generation, data, limit) => {
      if (next.held.size) throw Object.assign(Error("full"), { name: MEMORY_LIMIT_ERROR });
      return append(generation, data, limit);
    };
    return next;
  };
  for (let visit = 0; visit < 2; visit++) {
    const next = bounded();
    const api = campaignStoreApi(Promise.resolve(next.store), "eu4");
    await api.restore(1, "c", 100);
    expect(next.held).toEqual(new Set(["a"]));
    // The write after a restore asks only for what came back, at the index's next seq.
    const after = { ...request(point("a", 0)), nextSeq: 2 };
    expect(await api.persist("c", after, 100)).toMatchObject({
      status: "unchanged",
    });
  }
});

it("reads a campaign whose first index write was refused as never kept", async () => {
  const { store, held } = fakeStore();
  held.add("a");
  const api = campaignStoreApi(Promise.resolve(store), "eu4");
  await api.restore(1, "c", 100);
  full = (name) => name.startsWith("index-");
  expect(await api.persist("c", request(point("a", 0)), 100)).toMatchObject({ status: "full" });
  full = () => false;
  const next = campaignStoreApi(Promise.resolve(fakeStore().store), "eu4");
  expect((await next.restore(1, "c", 100)).status).toBe("none");
});
