import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ParserAdmission } from "./admission";
import { importBatch } from "./importScheduler";
import type { AnalysisSink, ImportOptions, ParserAdapter } from "./importScheduler";
import type { SnapshotDescriptor } from "./descriptor";
vi.mock("comlink", () => ({ wrap: () => ({}) }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => () => {} }));

type Result = { name: string };
const MIB = 1024 ** 2;
const workers: { terminate: ReturnType<typeof vi.fn> }[] = [];
const descriptor = (name: string) => ({ id: `test:1:${name}` }) as SnapshotDescriptor;
const files = (n: number) =>
  Array.from({ length: n }, (_, i) => new File(["save"], `save-${i}.sav`));

let parse: ReturnType<typeof vi.fn<(file: File) => Promise<Result>>>;
let append: ReturnType<typeof vi.fn<AnalysisSink<Result, SnapshotDescriptor>["append"]>>;
let generation: number;
let resident: number;
let admission: ParserAdmission;
const parser: ParserAdapter<object, Result> = {
  refuse: (file) => (file.name.endsWith(".sav") ? null : "Not a save"),
  start: () => new Worker("parser.js"),
  parse: (_api, file) => parse(file),
  peakBytes: () => 100 * MIB,
};
const sink: AnalysisSink<Result, SnapshotDescriptor> = {
  generation: () => generation,
  append: (...args) => append(...args),
  refreshResident: async () => admission.setResident("test", resident),
};
const options = (extra: Partial<ImportOptions<SnapshotDescriptor>> = {}) => ({
  signal: new AbortController().signal,
  admission,
  onCommitted: vi.fn(),
  ...extra,
});

beforeEach(() => {
  workers.length = 0;
  vi.stubGlobal(
    "Worker",
    class extends EventTarget {
      terminate = vi.fn();
      constructor() {
        super();
        workers.push(this);
      }
    },
  );
  generation = 1;
  resident = 0;
  admission = new ParserAdmission(1000 * MIB);
  parse = vi.fn(async (file: File) => ({ name: file.name }));
  append = vi.fn(async (_generation, result: Result) => ({
    descriptor: descriptor(result.name),
    duplicate: false,
  }));
});
afterEach(() => vi.unstubAllGlobals());

it("gives each input one outcome and publishes stored snapshots", async () => {
  parse.mockRejectedValueOnce(Error("missing field"));
  append
    .mockImplementationOnce(async () => ({ descriptor: descriptor("a"), duplicate: false }))
    .mockImplementationOnce(async () => ({ descriptor: descriptor("a"), duplicate: true }));
  const opts = options({ concurrency: 1 });
  const result = await importBatch([...files(3), new File(["x"], "notes.txt")], parser, sink, opts);
  expect(result.outcomes).toEqual({
    accepted: 1,
    duplicate: 1,
    failed: 2,
    refused: 0,
    unprocessed: 0,
    cancelled: 0,
  });
  expect(result.failures.map((f) => f.fileName)).toEqual(["notes.txt", "save-0.sav"]);
  // A duplicate still gives its file a source association.
  expect(opts.onCommitted).toHaveBeenCalledTimes(2);
  expect(append).toHaveBeenCalledWith(1, { name: "save-1.sav" });
  // The parser worker serves the batch, then stops.
  expect(workers).toHaveLength(1);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});

it("does not append a parse that ends after cancellation", async () => {
  const controller = new AbortController();
  const { promise, resolve } = Promise.withResolvers<Result>();
  parse.mockReturnValueOnce(promise);
  const opts = options({ signal: controller.signal, concurrency: 1 });
  const run = importBatch(files(2), parser, sink, opts);
  await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
  controller.abort();
  resolve({ name: "save-0.sav" });
  expect((await run).outcomes.cancelled).toBe(2);
  expect(append).not.toHaveBeenCalled();
  expect(admission.usage().active).toBe(0);
});

it("publishes a snapshot that an append stored during cancellation", async () => {
  const controller = new AbortController();
  const { promise, resolve } = Promise.withResolvers<{
    descriptor: SnapshotDescriptor;
    duplicate: boolean;
  }>();
  append.mockReturnValueOnce(promise);
  const opts = options({ signal: controller.signal, concurrency: 1 });
  const run = importBatch(files(2), parser, sink, opts);
  await vi.waitFor(() => expect(append).toHaveBeenCalledOnce());
  controller.abort();
  resolve({ descriptor: descriptor("a"), duplicate: false });
  const result = await run;
  expect(result.outcomes).toMatchObject({ accepted: 1, cancelled: 1 });
  expect(opts.onCommitted).toHaveBeenCalledOnce();
});

it("stops new parses when the store is full and counts the files it did not parse", async () => {
  const full = Object.assign(Error("Campaign analysis is full."), { name: "AnalysisMemoryLimit" });
  append
    .mockImplementationOnce(async () => ({ descriptor: descriptor("a"), duplicate: false }))
    .mockRejectedValueOnce(full);
  const result = await importBatch(files(4), parser, sink, options({ concurrency: 1 }));
  expect(parse).toHaveBeenCalledTimes(2);
  expect(result.memoryFull).toBe("Campaign analysis is full.");
  expect(result.outcomes).toMatchObject({ accepted: 1, refused: 1, unprocessed: 2 });
});

it("stops when the session is cleared and never appends to the new generation", async () => {
  append.mockImplementationOnce(async () => {
    generation++;
    return { descriptor: descriptor("a"), duplicate: false };
  });
  const result = await importBatch(files(3), parser, sink, options({ concurrency: 1 }));
  expect(append).toHaveBeenCalledTimes(1);
  expect(result.outcomes).toMatchObject({ accepted: 1, cancelled: 2 });
});

it("keeps at most one unstored result for each parser", async () => {
  append.mockImplementation(() => new Promise(() => {}));
  void importBatch(files(12), parser, sink, options({ concurrency: 4 }));
  await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(4));
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(parse).toHaveBeenCalledTimes(4);
});

it("runs fewer parsers as resident data fills the shared budget", async () => {
  // The budget holds three parsers. Each stored snapshot adds 150 MiB.
  admission = new ParserAdmission(300 * MIB);
  let running = 0;
  const peaks: number[] = [];
  parse.mockImplementation(async (file) => {
    peaks.push(++running);
    await new Promise((resolve) => setTimeout(resolve, 1));
    running--;
    return { name: file.name };
  });
  append.mockImplementation(async (_generation, result) => {
    resident += 150 * MIB;
    return { descriptor: descriptor(result.name), duplicate: false };
  });
  const result = await importBatch(files(8), parser, sink, options({ concurrency: 8 }));
  expect(result.outcomes.accepted).toBe(8);
  expect(Math.max(...peaks)).toBe(3);
  expect(peaks.slice(-3)).toEqual([1, 1, 1]);
});

it("stops the batch when publication fails", async () => {
  const opts = options({
    concurrency: 1,
    onCommitted: () => {
      throw Error("sink failed");
    },
  });
  await expect(importBatch(files(2), parser, sink, opts)).rejects.toThrow("sink failed");
  expect(parse).toHaveBeenCalledOnce();
});

it("reports the files that parsers have, and clears them at the end", async () => {
  const active: string[][] = [];
  parse.mockRejectedValueOnce(Error("invalid save"));
  await importBatch(
    files(3),
    parser,
    sink,
    options({ concurrency: 2, onActiveFiles: (f) => active.push(f.map((file) => file.name)) }),
  );
  expect(active).toContainEqual(["save-0.sav", "save-1.sav"]);
  expect(active.at(-1)).toEqual([]);
});
