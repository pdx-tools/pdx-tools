import { describe, expect, it, vi } from "vitest";
import { toPlaythroughId } from "@/features/campaign/types";
import type { CampaignGame } from "@/features/campaign/types";
import type { KeptBytes } from "./bytes";
import { sha256 } from "@/lib/sha256";
import { createCapture } from "./capture";
import type { CaptureEvents } from "./capture";
import type { KeptDb } from "./db";
import { identifyFiles, newestFiles, wasNewest } from "./folder";
import type { WatchConfig } from "./types";
import {
  changeStore,
  commitCapture,
  deleteKept,
  startWatch,
  sweepOrphans,
  syncFolder,
} from "./store";
import type { Capture, KeptEnv } from "./store";
import { fileState } from "./text";
import { IDLE_WATCH, indexKept, usedBytes } from "./keptStore";
import { DEFAULT_SETTINGS } from "./types";

const encode = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

function createEnv() {
  let tables: Record<string, Map<string, unknown>> = {};
  const keyOf = (record: Record<string, string>) => record.hash ?? record.key ?? record.game;
  const reader = (from: typeof tables) => ({
    get: async (name: string, key: string) => from[name]?.get(key),
    all: async (name: string) => [...(from[name]?.values() ?? [])],
  });
  const db = {
    get: (name: string, key: string) => reader(tables).get(name, key),
    all: (name: string) => reader(tables).all(name),
    transact: vi.fn(async (run: (transaction: unknown) => Promise<unknown>) => {
      const next = Object.fromEntries(
        Object.entries(tables).map(([name, rows]) => [name, new Map(rows)]),
      );
      const result = await run({
        ...reader(next),
        put: (name: string, record: Record<string, string>) =>
          (next[name] ??= new Map()).set(keyOf(record), record),
        remove: (name: string, key: string) => next[name]?.delete(key),
      });
      tables = next;
      return result;
    }),
  } as unknown as KeptDb & { transact: ReturnType<typeof vi.fn> };
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const bytes: KeptBytes = {
    write: vi.fn(async (hash, data) => {
      files.set(hash, data);
      return { modified: 1 };
    }),
    size: async (hash) => files.get(hash)?.byteLength ?? null,
    remove: async (hash) => void files.delete(hash),
    list: async () => [...files.keys()],
  };
  let queue: Promise<unknown> = Promise.resolve();
  const env: KeptEnv = {
    db,
    bytes,
    exclusive: (run) => {
      const result = queue.then(run);
      queue = result.catch(() => {});
      return result;
    },
    now: Date.now,
  };
  return { env, db, bytes, files };
}

const watch = (game: CampaignGame, keep = true) =>
  ({ game, id: `${game}-watch`, keep, wasWatching: true }) as WatchConfig;

const addWatch = (env: KeptEnv, config: WatchConfig, listing: Capture["listing"] = new Map()) =>
  startWatch(env, config, { listing, seed: true });

const setLimit = (env: KeptEnv, limit: number) =>
  changeStore(env, async ({ put }) => put("settings", { ...DEFAULT_SETTINGS, limit }));

const folderOf = async ({ db }: KeptEnv, game: CampaignGame) => (await db.get("folders", game))!;

/** The capture of a file whose bytes are its text. */
const capture = (text: string, change: Partial<Capture> = {}): Capture => ({
  game: "eu4",
  watchId: "eu4-watch",
  session: "session",
  path: "autosave.eu4",
  name: "autosave.eu4",
  hash: `hash-${text}`,
  data: encode(text),
  size: text.length,
  mtime: 10,
  listing: new Map(),
  ...change,
});

describe("commitCapture", () => {
  it("writes the bytes before the record, so that a crash leaves no record without bytes", async () => {
    const { env, db, bytes, files } = createEnv();
    await addWatch(env, watch("eu4"));
    vi.mocked(bytes.write).mockImplementationOnce(async (hash, data) => {
      files.set(hash, data);
      throw new Error("The tab was discarded");
    });
    await expect(commitCapture(env, capture("a"))).rejects.toThrow("discarded");
    expect(await db.get("saves", "hash-a")).toBeUndefined();
    expect((await folderOf(env, "eu4")).manifest).toEqual([]);

    await sweepOrphans(env);
    expect(files.size).toBe(0);
    expect(await commitCapture(env, capture("a"))).toEqual({ kept: true, isWrite: true });
  });

  it("writes the record, the manifest and the write log together", async () => {
    const { env, db } = createEnv();
    await addWatch(env, watch("eu4"));
    const { transact } = db;
    const run = transact.getMockImplementation() as (change: unknown) => Promise<unknown>;
    // Each put of the commit can be the last thing that happens.
    for (let last = 0; last < 4; last += 1) {
      transact.mockImplementationOnce((change: (x: Record<string, unknown>) => Promise<unknown>) =>
        run(async (transaction: { put: (...args: unknown[]) => void }) => {
          let puts = 0;
          return change({
            ...transaction,
            put: (...args: unknown[]) => {
              if (puts++ === last) throw new Error("The tab was discarded");
              transaction.put(...args);
            },
          });
        }),
      );
      await expect(commitCapture(env, capture("a"))).rejects.toThrow("discarded");
      const left = await Promise.all([db.all("saves"), db.all("writes")]);
      expect([...left.flat(), ...(await folderOf(env, "eu4")).manifest]).toEqual([]);
    }
    await commitCapture(env, capture("a"));
    const left = await Promise.all([db.all("saves"), db.all("writes")]);
    expect([...left, (await folderOf(env, "eu4")).manifest].map((x) => x.length)).toEqual([
      1, 1, 1,
    ]);
  });

  it("does not count a copy that the browser lost", async () => {
    const { env, db, files } = createEnv();
    await addWatch(env, watch("eu4"));
    await setLimit(env, 8);
    await commitCapture(env, capture("123456"));
    files.clear();
    expect(await commitCapture(env, capture("abcdef"))).toMatchObject({ kept: true });
    const saves = await db.all("saves");
    expect(usedBytes({ saves, missing: new Set(["hash-123456"]) })).toBe(6);
  });

  it("keeps the record when the identity parse never finishes", async () => {
    const { env, db } = createEnv();
    await addWatch(env, watch("eu4"));
    await commitCapture(env, capture("a"));
    expect(await db.get("saves", "hash-a")).toMatchObject({ identity: "pending", date: null });
    await sweepOrphans(env);
    expect(await env.bytes.size("hash-a")).toBe(1);
  });

  it("does not sweep the bytes of a commit in another tab", async () => {
    const { env, files } = createEnv();
    await addWatch(env, watch("eu4"));
    await Promise.all([
      commitCapture(env, capture("a")),
      sweepOrphans(env),
      commitCapture(env, capture("b")),
      sweepOrphans(env),
    ]);
    expect([...files.keys()]).toEqual(["hash-a", "hash-b"]);
  });

  it("does not write a copy after the player stops keeping copies", async () => {
    const { env, bytes } = createEnv();
    await addWatch(env, watch("eu4"));
    const write = vi.mocked(bytes.write);
    // The player turns copies off while the first commit reads.
    const first = commitCapture(env, capture("a"));
    const off = changeStore(env, async ({ get, put }) =>
      put("watches", { ...(await get("watches", "eu4"))!, keep: false }),
    ).then(() => write.mock.calls.length);
    const second = commitCapture(env, capture("b"));
    expect(await first).toEqual({ kept: true, isWrite: true });
    expect(await off).toBe(1);
    expect(await second).toEqual({ kept: false, isWrite: true });
    expect(write).toHaveBeenCalledOnce();
  });

  it("drops a queued save of a folder that the player changed or forgot", async () => {
    const { env, db } = createEnv();
    await addWatch(env, { ...watch("eu4"), id: "other" });
    expect(await commitCapture(env, capture("a"))).toBeNull();
    await addWatch(env, { ...watch("eu4"), wasWatching: false });
    expect(await commitCapture(env, capture("a"))).toBeNull();
    expect(await db.all("writes")).toEqual([]);
  });

  it("counts both games against the limit when they race near it", async () => {
    const { env, files } = createEnv();
    await addWatch(env, watch("eu4"));
    await addWatch(env, watch("eu5"));
    await setLimit(env, 10);
    const results = await Promise.all([
      commitCapture(env, capture("123456")),
      commitCapture(env, capture("abcdef", { game: "eu5", watchId: "eu5-watch" })),
    ]);
    expect(results.map((x) => x?.kept)).toEqual([true, false]);
    expect(files.size).toBe(1);
    const { missed } = await folderOf(env, "eu5");
    expect(missed).toMatchObject([{ hash: "hash-abcdef", reason: "limit" }]);
  });

  it("notes a save that the disk has no room for, and keeps the order of its write on a retry", async () => {
    const { env, db, bytes } = createEnv();
    await addWatch(env, watch("eu4"));
    vi.mocked(bytes.write).mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
    const first = capture("a");
    expect(await commitCapture(env, first)).toEqual({ kept: false, isWrite: true });
    await commitCapture(env, capture("b", { path: "manual.eu4", name: "manual.eu4" }));
    expect(await commitCapture(env, first)).toEqual({ kept: true, isWrite: false });
    const writes = await db.all("writes");
    expect(writes.map((x) => [x.hash, x.seq])).toEqual([
      ["hash-a", 1],
      ["hash-b", 2],
    ]);
    expect((await folderOf(env, "eu4")).missed).toEqual([]);
  });

  it("keeps the same bytes once, with each name", async () => {
    const { env, db, bytes } = createEnv();
    await addWatch(env, watch("eu4"));
    await commitCapture(env, capture("a"));
    await commitCapture(env, capture("a", { path: "backup.eu4", name: "backup.eu4" }));
    expect(bytes.write).toHaveBeenCalledOnce();
    expect(await db.get("saves", "hash-a")).toMatchObject({
      names: ["autosave.eu4", "backup.eu4"],
    });
  });

  it("points the last write at the copy when the game writes the same bytes again", async () => {
    const { env, db } = createEnv();
    await addWatch(env, watch("eu4"));
    await commitCapture(env, capture("a"));
    await commitCapture(env, capture("b", { mtime: 20 }));
    // The bytes return with their old time, such as from a backup.
    expect(await commitCapture(env, capture("a"))).toEqual({ kept: true, isWrite: true });
    const write = await db.get("writes", "hash-a");
    expect(write?.seq).toBe(3);
    expect(write?.writtenAt).toBeGreaterThan(20);
    expect(await db.all("saves")).toHaveLength(2);
  });

  it("writes the bytes again when the browser lost them", async () => {
    const { env, files } = createEnv();
    await addWatch(env, watch("eu4"));
    await commitCapture(env, capture("a"));
    files.clear();
    await commitCapture(env, capture("a", { path: "backup.eu4" }));
    expect(files.has("hash-a")).toBe(true);
  });

  it("deletes the record and the bytes", async () => {
    const { env, db, files } = createEnv();
    await addWatch(env, watch("eu4"));
    await commitCapture(env, capture("a"));
    await deleteKept(env, "hash-a");
    expect(files.size).toBe(0);
    expect(await db.get("saves", "hash-a")).toBeUndefined();
  });
});

type DiskFile = { text: string; mtime: number };

/** A folder whose files a test changes as a game does. */
function createFolder() {
  const disk = new Map<string, DiskFile>();
  const handle = (name: string) => ({
    kind: "file",
    name,
    getFile: async () => {
      const file = disk.get(name);
      if (!file) throw new DOMException("gone", "NotFoundError");
      return new File([file.text], name, { lastModified: file.mtime });
    },
  });
  const root = {
    kind: "directory",
    name: "save games",
    async *values() {
      for (const name of disk.keys()) yield handle(name);
    },
  } as unknown as FileSystemDirectoryHandle;
  return { disk, root };
}

async function createWatch(seed: [string, string][] = []) {
  const setup = createEnv();
  const { disk, root } = createFolder();
  for (const [name, text] of seed) disk.set(name, { text, mtime: 1 });
  const listing = new Map(seed.map(([name, text]) => [name, { size: text.length, mtime: 1 }]));
  await addWatch(setup.env, watch("eu4"), listing);
  const events: CaptureEvents = {
    captured: vi.fn(),
    files: vi.fn(),
    scanned: vi.fn(),
    changed: vi.fn(),
    failed: vi.fn(),
  };
  const check = vi.fn(async (data: Uint8Array) =>
    new TextDecoder().decode(data).endsWith("…") ? ("incomplete" as const) : ("complete" as const),
  );
  const start = () =>
    createCapture(
      { game: "eu4", watchId: "eu4-watch", session: "s", handle: root },
      setup.env,
      check,
      events,
    );
  let watcher = start();
  /** Let the watch read the folder until it waits for nothing. */
  const settle = async () => {
    const scans = vi.mocked(events.scanned).mock.calls.length;
    watcher.request();
    while (vi.mocked(events.scanned).mock.calls.length === scans) {
      await vi.advanceTimersByTimeAsync(250);
      // Hashes do not use timers.
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return {
    ...setup,
    disk,
    events,
    check,
    settle,
    restart: () => (watcher = start()),
    retry: () => watcher.retry(),
    request: () => watcher.request(),
    saves: async () =>
      (await setup.db.all("saves")).map((save) => save.name + "=" + setup.files.get(save.hash)),
    latest: async () => {
      const writes = await setup.db.all("writes");
      return writes.reduce((a, b) => (a.seq > b.seq ? a : b)).hash;
    },
  };
}

const hashOf = (text: string) => sha256(encode(text));

it("finds the last file of a campaign among newer files of others", () => {
  const listing = new Map([1, 2, 3].map((mtime) => [`${mtime}.eu4`, { size: 1, mtime }] as const));
  const version = (lastModified: number) => ({ size: 1, lastModified });
  const newest = newestFiles(listing);
  expect(wasNewest(newest, version(3), "mine")).toBe(true);
  // Until the newer files are read, they could be of the campaign.
  expect(wasNewest(newest, version(2), "mine")).toBe(false);
  const read = (ids: string[]) =>
    newest.map((x, i) => ({ ...x, playthroughId: toPlaythroughId(ids[i]) }));
  expect(wasNewest(read(["other", "mine", "mine"]), version(2), "mine")).toBe(true);
  expect(wasNewest(read(["mine", "mine", "mine"]), version(2), "mine")).toBe(false);
  expect(wasNewest(read(["other", "other", "mine"]), version(9), "mine")).toBe(false);
});

it("reads the campaign of the other files when one is gone or unreadable", async () => {
  const files = newestFiles(
    new Map([3, 2, 1].map((mtime) => [`${mtime}.eu4`, { size: 1, mtime }] as const)),
  );
  const read = (failure: Error) =>
    identifyFiles(files, async ({ mtime }) => {
      if (mtime === 3) throw failure;
      return toPlaythroughId(mtime === 2 ? "other" : "mine");
    });
  const mine = { size: 1, lastModified: 1 };
  const gone = await read(new DOMException("gone", "NotFoundError"));
  expect(wasNewest(gone, mine, "mine")).toBe(true);
  // A file that is there but cannot be read could be of the campaign.
  const unreadable = await read(new DOMException("busy", "NotReadableError"));
  expect(unreadable.map((x) => x.playthroughId)).toEqual([null, "other", "mine"]);
  expect(wasNewest(unreadable, mine, "mine")).toBe(false);
});

describe("createCapture", () => {
  const flow = (name: string, test: () => Promise<void>) =>
    it(name, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      try {
        await test();
      } finally {
        vi.useRealTimers();
      }
    });

  flow("keeps three rotated autosaves once each, and the new one is the last write", async () => {
    const watch = await createWatch();
    watch.disk.set("old_autosave.eu4", { text: "1", mtime: 1 });
    watch.disk.set("older_autosave.eu4", { text: "2", mtime: 2 });
    watch.disk.set("autosave.eu4", { text: "3", mtime: 3 });
    await watch.settle();
    expect(await watch.latest()).toBe(await hashOf("3"));

    // Copies, with new times, oldest first.
    watch.disk.set("old_autosave.eu4", { text: "2", mtime: 4 });
    watch.disk.set("older_autosave.eu4", { text: "3", mtime: 5 });
    watch.disk.set("autosave.eu4", { text: "4", mtime: 6 });
    await watch.settle();
    expect(await watch.db.all("saves")).toHaveLength(4);
    expect(await watch.latest()).toBe(await hashOf("4"));
    const writes = await watch.db.all("writes");
    expect(writes.map((x) => x.seq)).toEqual([1, 2, 3, 4]);
  });

  flow("does not move the last write for a rename or a backup copy", async () => {
    const watch = await createWatch();
    watch.disk.set("a.eu4", { text: "1", mtime: 1 });
    await watch.settle();
    watch.disk.set("b.eu4", { text: "2", mtime: 2 });
    await watch.settle();
    watch.disk.set("renamed.eu4", watch.disk.get("a.eu4")!);
    watch.disk.delete("a.eu4");
    await watch.settle();
    watch.disk.set("backup.eu4", { text: "1", mtime: 9 });
    await watch.settle();
    expect(await watch.latest()).toBe(await hashOf("2"));
  });

  flow("moves the last write when a backup is restored with its old time", async () => {
    const watch = await createWatch();
    watch.disk.set("backup.eu4", { text: "1", mtime: 1 });
    watch.disk.set("ironman.eu4", { text: "1", mtime: 1 });
    await watch.settle();
    watch.disk.set("ironman.eu4", { text: "2", mtime: 2 });
    await watch.settle();
    expect(await watch.latest()).toBe(await hashOf("2"));
    watch.disk.set("ironman.eu4", { text: "1", mtime: 1 });
    await watch.settle();
    expect(await watch.latest()).toBe(await hashOf("1"));
  });

  flow("does not keep the files from before the watch until the game writes them", async () => {
    const watch = await createWatch([
      ["open.eu4", "open"],
      ["other.eu4", "other"],
    ]);
    await watch.settle();
    watch.restart();
    await watch.settle();
    expect(await watch.saves()).toEqual([]);

    // A listing can miss a file that comes back unchanged.
    const other = watch.disk.get("other.eu4")!;
    watch.disk.delete("other.eu4");
    await watch.settle();
    watch.disk.set("other.eu4", other);
    await watch.settle();
    expect(await watch.saves()).toEqual([]);

    // The game renames a file, then writes another one.
    watch.disk.set("older.eu4", other);
    watch.disk.delete("other.eu4");
    watch.disk.set("open.eu4", { text: "next", mtime: 2 });
    await watch.settle();
    expect(await watch.db.all("saves")).toMatchObject([{ name: "open.eu4", size: 4 }]);
  });

  flow("leaves the folder of a newer watch alone, with the files that it excludes", async () => {
    const watch = await createWatch([["old.eu4", "old"]]);
    const next = { ...(await watch.db.get("watches", "eu4"))!, id: "next" };
    const listing = new Map([["old.eu4", { size: 3, mtime: 1 }]]);
    await startWatch(watch.env, next, { listing, seed: true });
    watch.request();
    await vi.advanceTimersByTimeAsync(5000);
    const root = { game: "eu4" as const, watchId: "next" };
    expect(await syncFolder(watch.env, root, listing)).toMatchObject({ changed: [], missed: [] });
  });

  flow(
    "does not say that an overwritten save is in the folder while the next one is half written",
    async () => {
      const watch = await createWatch();
      // The view reads the records again only when an event says so.
      let seen: string | undefined;
      let reading: Promise<void> | undefined;
      const read = async () => {
        const [saves, writes, folders] = await Promise.all([
          watch.db.all("saves"),
          watch.db.all("writes"),
          watch.db.all("folders"),
        ]);
        seen = fileState(saves[0], {
          index: indexKept(saves, writes, folders),
          watches: { eu4: await watch.db.get("watches", "eu4") },
          folders: { eu4: folders[0] },
          live: { eu4: { ...IDLE_WATCH, phase: "watching" }, eu5: IDLE_WATCH },
        });
      };
      watch.disk.set("a.eu4", { text: "first", mtime: 1 });
      await watch.settle();
      await read();
      expect(seen).toBe("in-folder");
      vi.mocked(watch.events.changed).mockImplementation(() => {
        reading = read();
      });
      watch.disk.set("a.eu4", { text: "half…", mtime: 2 });
      await watch.settle();
      await reading;
      expect(seen).toBe("overwritten");
      watch.disk.delete("a.eu4");
      await watch.settle();
      await reading;
      expect(seen).toBe("unknown");
    },
  );

  flow("moves the last write for a restore that an old overwrite does not explain", async () => {
    const watch = await createWatch();
    watch.disk.set("one.eu4", { text: "A", mtime: 1 });
    watch.disk.set("two.eu4", { text: "C", mtime: 2 });
    await watch.settle();
    watch.disk.set("one.eu4", { text: "B", mtime: 3 });
    await watch.settle();
    await vi.advanceTimersByTimeAsync(60_000);
    watch.disk.set("two.eu4", { text: "A", mtime: 1 });
    await watch.settle();
    expect(await watch.latest()).toBe(await hashOf("A"));
    const [save] = (await watch.db.all("saves")).filter(
      (x) => x.names.includes("two.eu4") && x.name === "one.eu4",
    );
    expect(save.writtenAt).toBeGreaterThan(3);
  });

  flow("waits while a file changes, and reads it when it is whole", async () => {
    const watch = await createWatch();
    watch.disk.set("a.eu4", { text: "half…", mtime: 1 });
    await watch.settle();
    expect(await watch.saves()).toEqual([]);
    expect(watch.events.files).toHaveBeenLastCalledWith(
      expect.objectContaining({ rejected: expect.objectContaining({ integrity: "incomplete" }) }),
    );
    expect(watch.check).toHaveBeenCalledOnce();

    watch.disk.set("a.eu4", { text: "whole", mtime: 2 });
    await watch.settle();
    expect(await watch.db.all("saves")).toHaveLength(1);
    expect(watch.events.files).toHaveBeenLastCalledWith({ writing: null, rejected: null });
  });

  flow("does not keep bytes when the file changes during the read", async () => {
    const watch = await createWatch();
    watch.disk.set("a.eu4", { text: "first", mtime: 1 });
    const read = vi.spyOn(File.prototype, "arrayBuffer").mockImplementationOnce(async () => {
      watch.disk.set("a.eu4", { text: "second", mtime: 2 });
      return encode("first").buffer;
    });
    await watch.settle();
    await watch.settle();
    read.mockRestore();
    const saves = await watch.db.all("saves");
    expect(saves.map((save) => save.hash)).toEqual([await hashOf("second")]);
  });

  flow("keeps a save after the limit rises, if the file is still there", async () => {
    const watch = await createWatch();
    await setLimit(watch.env, 1);
    watch.disk.set("a.eu4", { text: "first", mtime: 1 });
    watch.disk.set("b.eu4", { text: "other", mtime: 1 });
    await watch.settle();
    expect((await folderOf(watch.env, "eu4")).missed).toHaveLength(2);
    expect(watch.events.captured).toHaveBeenCalledWith(
      expect.objectContaining({ kept: false, file: expect.any(File) }),
    );

    await setLimit(watch.env, 1000);
    watch.disk.delete("b.eu4");
    watch.retry();
    await watch.settle();
    expect(await watch.db.all("saves")).toMatchObject([{ name: "a.eu4" }]);
    expect((await folderOf(watch.env, "eu4")).missed).toEqual([]);
  });

  flow("ignores empty files and files of other games", async () => {
    const watch = await createWatch();
    watch.disk.set("a.eu4", { text: "", mtime: 1 });
    watch.disk.set("a.eu4.tmp", { text: "x", mtime: 1 });
    watch.disk.set("a.eu5", { text: "x", mtime: 1 });
    await watch.settle();
    expect(await watch.saves()).toEqual([]);
  });
});
