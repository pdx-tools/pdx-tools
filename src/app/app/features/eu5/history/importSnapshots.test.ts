import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./types";

const mocks = vi.hoisted(() => ({
  preparePlaybackCache: vi.fn(),
  parseSnapshot: vi.fn(),
  sha256File: vi.fn(),
  blake3File: vi.fn(),
  cachedHashAlias: vi.fn(),
  cacheHashAlias: vi.fn(),
  cacheSnapshots: vi.fn(),
  streamSnapshots: vi.fn(),
}));
vi.mock("comlink", () => ({ wrap: () => mocks }));
vi.mock("./cache", () => mocks);
vi.mock("../../../../../../dev/eu5-streaming/pool.js", () => ({
  importSnapshots: mocks.streamSnapshots,
}));
import { importTimeline } from "./importSnapshots";

const sha = "a".repeat(64);
const blake3 = `blake3:${"b".repeat(64)}`;
const snapshot = (hash: string) =>
  ({
    schemaVersion: 3,
    hash,
    campaignId: "campaign",
    version: "1.0.0",
    date: "1337-01-01",
    dateSort: 13370101,
    fileName: "save.eu5",
  }) as Snapshot;

async function reattach(existing: string, incoming: string) {
  const file = new File(["SAV01000text"], "save.eu5");
  const onSnapshots = vi.fn();
  mocks.parseSnapshot.mockResolvedValue({ snapshot: snapshot(incoming) });
  mocks.streamSnapshots.mockImplementation(async (_files, options) => {
    await options.onSnapshot(snapshot(incoming), file);
    return { errors: [] };
  });
  vi.stubGlobal("crossOriginIsolated", incoming.startsWith("blake3:"));
  const result = await importTimeline([file], {
    signal: new AbortController().signal,
    existing: [snapshot(existing)],
    onSnapshots,
    onProgress: vi.fn(),
    onWarning: vi.fn(),
    concurrency: 1,
  });
  return { result, onSnapshots, file };
}

describe("timeline content identity migration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      "Worker",
      class {
        terminate() {}
      },
    );
    vi.stubGlobal("navigator", { hardwareConcurrency: 2 });
    mocks.cachedHashAlias.mockResolvedValue(undefined);
    mocks.cacheHashAlias.mockResolvedValue(undefined);
    mocks.cacheSnapshots.mockResolvedValue(undefined);
    mocks.sha256File.mockResolvedValue(sha);
    mocks.blake3File.mockResolvedValue(blake3);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reattaches a SHA fallback to an existing BLAKE3 observation", async () => {
    const { result, onSnapshots, file } = await reattach(blake3, sha);
    expect(result.errors).toEqual([]);
    expect(mocks.blake3File).toHaveBeenCalledWith(file);
    expect(mocks.cacheHashAlias).toHaveBeenCalledWith(blake3, sha);
    expect(onSnapshots.mock.calls[0][0][0].hash).toBe(blake3);
    expect(onSnapshots.mock.calls[0][1]).toEqual([
      { snapshot: expect.objectContaining({ hash: blake3 }), file },
    ]);
    expect(mocks.cacheSnapshots).toHaveBeenCalledWith([]);
  });

  it("reuses a verified alias without hashing again", async () => {
    mocks.cachedHashAlias.mockResolvedValue(sha);
    const { result } = await reattach(blake3, sha);
    expect(result.errors).toEqual([]);
    expect(mocks.blake3File).not.toHaveBeenCalled();
  });

  it("verifies bytes when the alias cache cannot be read", async () => {
    mocks.cachedHashAlias.mockRejectedValue(Error("Cache unavailable"));
    const { result } = await reattach(blake3, sha);
    expect(result.errors).toEqual([]);
    expect(mocks.blake3File).toHaveBeenCalledOnce();
  });

  it("rejects different bytes from the same campaign and date", async () => {
    mocks.blake3File.mockResolvedValue(`blake3:${"c".repeat(64)}`);
    const { result, onSnapshots } = await reattach(blake3, sha);
    expect(result.errors[0].error).toContain("A different save already occupies");
    expect(onSnapshots).not.toHaveBeenCalled();
    expect(mocks.cacheHashAlias).not.toHaveBeenCalled();
  });

  it("continues to preserve an existing SHA identity during streaming migration", async () => {
    const { result, onSnapshots, file } = await reattach(sha, blake3);
    expect(result.errors).toEqual([]);
    expect(mocks.sha256File).toHaveBeenCalledWith(file);
    expect(onSnapshots.mock.calls[0][0][0].hash).toBe(sha);
  });
});

describe("timeline parser failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports an unsupported save and continues importing later files", async () => {
    vi.resetAllMocks();
    vi.stubGlobal("crossOriginIsolated", false);
    vi.stubGlobal(
      "Worker",
      class {
        terminate() {}
      },
    );
    mocks.cacheSnapshots.mockResolvedValue(undefined);
    mocks.parseSnapshot
      .mockRejectedValueOnce(Error("missing field morale"))
      .mockResolvedValueOnce({ snapshot: snapshot(sha) });
    const unsupported = new File(["SAV01000bad"], "unsupported.eu5");
    const supported = new File(["SAV01000good"], "supported.eu5");
    const onSnapshots = vi.fn();
    const result = await importTimeline([unsupported, supported], {
      signal: new AbortController().signal,
      existing: [],
      onSnapshots,
      onProgress: vi.fn(),
      onWarning: vi.fn(),
    });
    expect(result.completed).toBe(2);
    expect(result.errors).toEqual([
      { fileName: unsupported.name, error: "Error: missing field morale" },
    ]);
    expect(onSnapshots.mock.calls[0][1]).toEqual([
      { snapshot: expect.objectContaining({ hash: sha }), file: supported },
    ]);
  });
});

it("finishes playback preparation before resolving import and preserves observations on cache failure", async () => {
  vi.resetAllMocks();
  vi.stubGlobal("crossOriginIsolated", false);
  vi.stubGlobal(
    "Worker",
    class {
      terminate() {}
    },
  );
  const file = new File(["save"], "save.eu5");
  mocks.parseSnapshot.mockResolvedValue({ snapshot: snapshot(sha) });
  mocks.cacheSnapshots.mockResolvedValue(undefined);
  let finish: () => void = () => {};
  mocks.preparePlaybackCache.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const onProgress = vi.fn();
  const onSnapshots = vi.fn();
  const onWarning = vi.fn();
  let done = false;
  const options = {
    signal: new AbortController().signal,
    existing: [],
    onProgress,
    onSnapshots,
    onWarning,
  };
  const job = importTimeline([file], options).then(() => {
    done = true;
  });
  await vi.waitFor(() => expect(mocks.preparePlaybackCache).toHaveBeenCalledWith(file, sha, false));
  expect(onSnapshots).toHaveBeenCalledOnce();
  expect(done).toBe(false);
  finish();
  await job;
  expect(onProgress).toHaveBeenLastCalledWith(
    2,
    2,
    "Preparing playback: save.eu5",
    expect.objectContaining({ phase: "playback", completed: 1, total: 1 }),
  );
  mocks.preparePlaybackCache.mockRejectedValue(Error("QuotaExceededError"));
  const result = await importTimeline([file], options);
  expect(result.errors).toEqual([]);
  expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("original save remains usable"));
  vi.unstubAllGlobals();
});

it("prepares eight saves concurrently and stops every cache worker on cancellation", async () => {
  vi.resetAllMocks();
  vi.stubGlobal("crossOriginIsolated", false);
  vi.stubGlobal("navigator", { deviceMemory: 8 });
  const terminate = vi.fn();
  vi.stubGlobal(
    "Worker",
    class {
      terminate = terminate;
    },
  );
  let date = 0;
  mocks.parseSnapshot.mockImplementation(async () => ({
    snapshot: {
      ...snapshot(sha),
      dateSort: 13370101 + date++,
    },
  }));
  mocks.cacheSnapshots.mockResolvedValue(undefined);
  mocks.preparePlaybackCache.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const job = importTimeline(
    Array.from({ length: 12 }, (_, i) => new File(["SAV01000save"], `${i}.eu5`)),
    {
      signal: controller.signal,
      existing: [],
      onSnapshots: vi.fn(),
      onProgress: vi.fn(),
      onWarning: vi.fn(),
    },
  );
  const rejected = expect(job).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.preparePlaybackCache).toHaveBeenCalledTimes(8));
  controller.abort();
  await rejected;
  expect(terminate.mock.calls.length).toBeGreaterThanOrEqual(8);
  vi.unstubAllGlobals();
});

it("reduces playback concurrency on devices with limited memory", async () => {
  vi.resetAllMocks();
  vi.stubGlobal("crossOriginIsolated", false);
  vi.stubGlobal("navigator", { deviceMemory: 2 });
  vi.stubGlobal(
    "Worker",
    class {
      terminate() {}
    },
  );
  let date = 0;
  mocks.parseSnapshot.mockImplementation(async () => ({
    snapshot: {
      ...snapshot(sha),
      dateSort: 13370101 + date++,
    },
  }));
  mocks.cacheSnapshots.mockResolvedValue(undefined);
  mocks.preparePlaybackCache.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const job = importTimeline(
    Array.from({ length: 8 }, (_, i) => new File(["SAV01000save"], `${i}.eu5`)),
    {
      signal: controller.signal,
      existing: [],
      onSnapshots: vi.fn(),
      onProgress: vi.fn(),
      onWarning: vi.fn(),
    },
  );
  const rejected = expect(job).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.preparePlaybackCache).toHaveBeenCalledTimes(2));
  controller.abort();
  await rejected;
  vi.unstubAllGlobals();
});
