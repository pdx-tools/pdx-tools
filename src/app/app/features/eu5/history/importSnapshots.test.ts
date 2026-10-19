import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ImportOptions } from "./importSnapshots";
const mocks = vi.hoisted(() => ({
  parseImport: vi.fn(),
  append: vi.fn(),
  memory: vi.fn(),
  workers: [] as { terminate: ReturnType<typeof vi.fn> }[],
}));
vi.mock("comlink", () => ({ wrap: () => mocks }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: vi.fn(() => vi.fn()) }));
vi.mock("./analysisClient", () => ({
  appendAnalysis: mocks.append,
  campaignAnalysis: () => ({
    memory: async () => ({ bufferBytes: await mocks.memory() }),
  }),
}));
import { importTimeline } from "./importSnapshots";
const descriptor = (id: number) => ({
  id: `eu5:1:${id}`,
  campaignId: "campaign",
  date: `1360-${String(id + 1).padStart(2, "0")}-01`,
  dateSort: 13600101 + id * 100,
  gameVersion: "1.4.0",
});
const appended = (id: number) => ({ descriptor: descriptor(id), duplicate: false });
function options(extra: Partial<ImportOptions> = {}): ImportOptions {
  return {
    signal: new AbortController().signal,
    onSnapshots: vi.fn(),
    onProgress: vi.fn(),
    ...extra,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.workers = [];
  vi.stubGlobal(
    "Worker",
    class extends EventTarget {
      terminate = vi.fn();
      constructor() {
        super();
        mocks.workers.push(this);
      }
    },
  );
  vi.stubGlobal("navigator", { deviceMemory: 32 });
  mocks.memory.mockResolvedValue(0);
  mocks.parseImport.mockImplementation(async (file: File) => ({ name: file.name }));
  mocks.append.mockImplementation(async (result: { name: string }) =>
    appended(Number(result.name.match(/\d+/)?.[0] ?? 0)),
  );
});
afterEach(() => vi.unstubAllGlobals());
it("publishes only accepted analysis and performs no cache-finishing phase", async () => {
  const opts = options();
  const result = await importTimeline([new File(["SAV01000text"], "save-0.eu5")], opts);
  expect(result.errors).toEqual([]);
  expect(mocks.parseImport).toHaveBeenCalledWith(expect.any(File));
  expect(opts.onSnapshots).toHaveBeenCalledWith(
    [descriptor(0)],
    [{ snapshot: descriptor(0), file: expect.any(File) }],
  );
});
it("keeps successful observations when another full parse fails", async () => {
  mocks.parseImport.mockRejectedValueOnce(Error("missing field"));
  const opts = options({ concurrency: 1 });
  const result = await importTimeline(
    [0, 1].map((i) => new File(["save"], `save-${i}.eu5`)),
    opts,
  );
  expect(result.errors).toEqual([{ fileName: "save-0.eu5", error: "Error: missing field" }]);
  expect(opts.onSnapshots).toHaveBeenCalledOnce();
});
it("rejects conflicting dates before publishing an observation", async () => {
  mocks.append.mockRejectedValue(Error("A different save already occupies this date"));
  const opts = options();
  const result = await importTimeline([new File(["save"], "save-0.eu5")], opts);
  expect(result.errors[0].error).toContain("already occupies");
  expect(opts.onSnapshots).not.toHaveBeenCalled();
});
it("cancels queued parsers and never publishes a late response", async () => {
  const controller = new AbortController();
  let finish!: (value: unknown) => void;
  mocks.parseImport.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const opts = options({ signal: controller.signal, concurrency: 1 });
  const run = importTimeline([new File(["save"], "save-0.eu5")], opts);
  const failure = expect(run).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.parseImport).toHaveBeenCalledOnce());
  controller.abort();
  finish({ name: "save-0.eu5" });
  await failure;
  expect(mocks.append).not.toHaveBeenCalled();
  expect(opts.onSnapshots).not.toHaveBeenCalled();
});
it("bounds concurrent unappended results to eight", async () => {
  const controller = new AbortController();
  mocks.append.mockImplementation(() => new Promise(() => {}));
  const run = importTimeline(
    Array.from({ length: 12 }, (_, i) => new File(["save"], `save-${i}.eu5`)),
    options({ signal: controller.signal, concurrency: 8 }),
  );
  const failure = expect(run).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.append).toHaveBeenCalledTimes(8));
  expect(mocks.parseImport).toHaveBeenCalledTimes(8);
  controller.abort();
  await failure;
});
it("reduces parser concurrency when resident analytical data consumes the memory budget", async () => {
  vi.stubGlobal("navigator", { deviceMemory: 4 });
  mocks.memory.mockResolvedValue(2 * 1024 ** 3);
  const controller = new AbortController();
  mocks.append.mockImplementation(() => new Promise(() => {}));
  const run = importTimeline(
    [0, 1, 2].map((i) => new File(["save"], `save-${i}.eu5`)),
    options({ signal: controller.signal }),
  );
  const failure = expect(run).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.append).toHaveBeenCalledOnce());
  controller.abort();
  await failure;
});
it("aborts the remaining import when publication fails", async () => {
  const opts = options({
    concurrency: 1,
    onSnapshots: () => {
      throw Error("sink failed");
    },
  });
  await expect(
    importTimeline(
      [0, 1].map((i) => new File(["save"], `save-${i}.eu5`)),
      opts,
    ),
  ).rejects.toThrow("sink failed");
  expect(mocks.parseImport).toHaveBeenCalledOnce();
});

it("publishes an observation committed during cancellation", async () => {
  const controller = new AbortController();
  let finish!: (value: ReturnType<typeof appended>) => void;
  mocks.append.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const opts = options({ signal: controller.signal, concurrency: 1 });
  const run = importTimeline([new File(["save"], "save-0.eu5")], opts);
  const failure = expect(run).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.append).toHaveBeenCalledOnce());
  controller.abort();
  finish(appended(0));
  await failure;
  await vi.waitFor(() => expect(opts.onSnapshots).toHaveBeenCalledOnce());
});
it("reduces active parser lanes as analytical columns accumulate", async () => {
  vi.stubGlobal("navigator", { deviceMemory: 8 });
  mocks.memory.mockResolvedValueOnce(0).mockResolvedValue(4 * 1024 ** 3);
  const opts = options({ concurrency: 8 });
  await importTimeline(
    Array.from({ length: 12 }, (_, i) => new File(["save"], `save-${i}.eu5`)),
    opts,
  );
  expect(opts.onSnapshots).toHaveBeenCalledTimes(12);
  expect(opts.onProgress).toHaveBeenLastCalledWith(
    12,
    12,
    expect.any(String),
    expect.objectContaining({ concurrency: 1 }),
  );
});

it("reports all active parsers separately from queued files and clears them after failure or cancellation", async () => {
  const controller = new AbortController();
  const failures = new Map<string, (error: Error) => void>();
  mocks.parseImport.mockImplementation(
    (file: File) =>
      new Promise((_resolve, reject) => {
        failures.set(file.name, reject);
      }),
  );
  const active: string[][] = [];
  const run = importTimeline(
    [0, 1, 2].map((i) => new File(["save"], `save-${i}.eu5`)),
    options({
      signal: controller.signal,
      concurrency: 2,
      onActiveFiles: (files) => active.push(files.map((file) => file.name)),
    }),
  );
  const failure = expect(run).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(failures.size).toBe(2));
  expect(active.at(-1)).toEqual(["save-0.eu5", "save-1.eu5"]);
  failures.get("save-0.eu5")!(Error("invalid save"));
  await vi.waitFor(() => expect(failures.size).toBe(3));
  expect(active.at(-1)).toEqual(["save-1.eu5", "save-2.eu5"]);
  controller.abort();
  await failure;
  await vi.waitFor(() => expect(active.at(-1)).toEqual([]));
});

it("reuses parser workers between saves, including a failed parse, and releases the batch", async () => {
  mocks.parseImport.mockRejectedValueOnce(Error("invalid save"));
  const result = await importTimeline(
    [0, 1, 2].map((i) => new File(["save"], `save-${i}.eu5`)),
    options({ concurrency: 1 }),
  );
  expect(result.errors).toHaveLength(1);
  expect(mocks.parseImport).toHaveBeenCalledTimes(3);
  expect(mocks.workers).toHaveLength(1);
  expect(mocks.workers[0].terminate).toHaveBeenCalledOnce();
});

it("stops parsing when the store is full and counts the saves that it refused", async () => {
  const full = Object.assign(Error("Campaign analysis is full."), { name: "AnalysisMemoryLimit" });
  mocks.append.mockImplementationOnce(async () => appended(0)).mockRejectedValueOnce(full);
  const opts = options({ concurrency: 1 });
  const result = await importTimeline(
    [0, 1, 2, 3].map((i) => new File(["save"], `save-${i}.eu5`)),
    opts,
  );
  expect(mocks.parseImport).toHaveBeenCalledTimes(2);
  expect(opts.onSnapshots).toHaveBeenCalledOnce();
  expect(result.errors).toEqual([]);
  expect(result.memoryFull).toEqual({ message: "Campaign analysis is full.", refused: 3 });
});

it("reports failed files by identity when names match", async () => {
  const bad = new File(["bad"], "same.eu5");
  const good = new File(["good"], "same.eu5");
  mocks.parseImport.mockRejectedValueOnce(Error("invalid save"));
  const onFileError = vi.fn();
  await importTimeline([bad, good], options({ concurrency: 1, onFileError }));
  expect(onFileError).toHaveBeenCalledExactlyOnceWith(bad, "Error: invalid save");
});
