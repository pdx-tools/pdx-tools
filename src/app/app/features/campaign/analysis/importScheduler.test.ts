import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisAdmission } from "./admission";
import type { SnapshotDescriptor } from "./descriptor";
import { importBatch } from "./importScheduler";
import type { AnalysisSink, ImportOptions, ParserAdapter } from "./importScheduler";
import type { AppendResult } from "./session";
import { staleGenerationError } from "./session";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  workers: [] as { terminate: ReturnType<typeof vi.fn> }[],
}));
vi.mock("comlink", () => ({ wrap: () => ({ parse: mocks.parse }) }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => () => {} }));

type Output = { name: string };
type Api = { parse: (file: File) => Promise<Output> };

const MiB = 1024 ** 2;
const parser: ParserAdapter<Api, Output> = {
  refuse: (file) => (file.name.endsWith(".sav") ? null : "Not a save"),
  start: () => new Worker("parser.js"),
  parse: (api, file) => api.parse(file),
  peakBytes: () => 100 * MiB,
};

const descriptor = (name: string) =>
  ({ id: `test:1:${name}`, campaignId: "campaign", dateSort: 1 }) as SnapshotDescriptor;

/** A session that stores each output, or follows `append` when it is given. */
function sink(append?: (output: Output) => Promise<AppendResult<SnapshotDescriptor>>) {
  let generation = 1;
  let stop = new AbortController();
  const appended: string[] = [];
  const value: AnalysisSink<Output, SnapshotDescriptor> & {
    appended: string[];
    clear: () => void;
  } = {
    appended,
    generation: () => generation,
    signal: () => stop.signal,
    append: vi.fn(async (requested: number, output: Output) => {
      if (requested !== generation) throw staleGenerationError();
      const result = append
        ? await append(output)
        : { descriptor: descriptor(output.name), duplicate: false };
      if (requested !== generation) throw staleGenerationError();
      appended.push(output.name);
      return result;
    }),
    clear: () => {
      generation++;
      stop.abort(new DOMException("Cleared", "AbortError"));
      stop = new AbortController();
    },
  };
  return value;
}

const files = (count: number, extension = "sav") =>
  Array.from({ length: count }, (_, i) => new File(["save"], `save-${i}.${extension}`));

function options(
  extra: Partial<ImportOptions<SnapshotDescriptor, Output>> = {},
): ImportOptions<SnapshotDescriptor, Output> {
  return {
    signal: new AbortController().signal,
    lease: new AnalysisAdmission({
      residentBytes: 1000 * MiB,
      parserBytes: 10_000 * MiB,
    }).acquireImport(),
    onCommitted: vi.fn(),
    ...extra,
  };
}

const memoryFull = () =>
  Object.assign(Error("Campaign analysis is full."), { name: "AnalysisMemoryLimit" });

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
  mocks.parse.mockImplementation(async (file: File) => ({ name: file.name }));
});
afterEach(() => vi.unstubAllGlobals());

describe("outcomes", () => {
  it("give each input one outcome", async () => {
    const session = sink(async (output) => {
      if (output.name === "save-1.sav") throw memoryFull();
      return { descriptor: descriptor(output.name), duplicate: output.name === "save-2.sav" };
    });
    mocks.parse.mockImplementation(async (file: File) => {
      if (file.name === "save-0.sav") throw Error("missing field");
      return { name: file.name };
    });
    const input = [...files(4), new File(["x"], "notes.txt")];
    const result = await importBatch(input, parser, session, options({ concurrency: 1 }));
    expect(result.files).toEqual(["failed", "refused", "unprocessed", "unprocessed", "failed"]);
    expect(result.outcomes).toEqual({
      accepted: 0,
      duplicate: 0,
      failed: 2,
      refused: 1,
      unprocessed: 2,
      cancelled: 0,
    });
    expect(result.failures).toEqual([
      { fileName: "notes.txt", error: "Not a save" },
      { fileName: "save-0.sav", error: "Error: missing field" },
    ]);
    expect(result.memoryFull).toBe("Campaign analysis is full.");
  });

  it("separate duplicates from new snapshots and publish both", async () => {
    const session = sink(async (output) => ({
      descriptor: descriptor("same"),
      duplicate: output.name !== "save-0.sav",
    }));
    const opts = options({ concurrency: 1 });
    const result = await importBatch(files(3), parser, session, opts);
    expect(result.files).toEqual(["accepted", "duplicate", "duplicate"]);
    expect(opts.onCommitted).toHaveBeenCalledTimes(3);
  });

  it("report each failed file by identity when names match", async () => {
    const bad = new File(["bad"], "same.sav");
    const good = new File(["good"], "same.sav");
    mocks.parse.mockRejectedValueOnce(Error("invalid save"));
    const onFileOutcome = vi.fn();
    await importBatch([bad, good], parser, sink(), options({ concurrency: 1, onFileOutcome }));
    expect(onFileOutcome.mock.calls).toEqual([
      [bad, "failed", "Error: invalid save"],
      [good, "accepted", undefined],
    ]);
  });
});

describe("cancellation", () => {
  it("before the parse starts parses nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await importBatch(
      files(2),
      parser,
      sink(),
      options({ signal: controller.signal }),
    );
    expect(result.files).toEqual(["cancelled", "cancelled"]);
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("during a parse stops the parser and appends nothing", async () => {
    const controller = new AbortController();
    mocks.parse.mockReturnValue(new Promise(() => {}));
    const session = sink();
    const run = importBatch(
      files(3),
      parser,
      session,
      options({ signal: controller.signal, concurrency: 2 }),
    );
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(2));
    controller.abort();
    const result = await run;
    expect(result.files).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(session.append).not.toHaveBeenCalled();
    expect(mocks.workers.every((worker) => worker.terminate.mock.calls.length > 0)).toBe(true);
  });

  it("across an append publishes the committed snapshot", async () => {
    const controller = new AbortController();
    const { promise: stored, resolve } = Promise.withResolvers<AppendResult<SnapshotDescriptor>>();
    const session = sink(() => stored);
    const opts = options({ signal: controller.signal, concurrency: 1 });
    const run = importBatch(files(2), parser, session, opts);
    await vi.waitFor(() => expect(session.append).toHaveBeenCalledOnce());
    controller.abort();
    resolve({ descriptor: descriptor("save-0.sav"), duplicate: false });
    const result = await run;
    expect(result.files).toEqual(["accepted", "cancelled"]);
    expect(opts.onCommitted).toHaveBeenCalledWith(descriptor("save-0.sav"), expect.any(File));
    expect(mocks.parse).toHaveBeenCalledOnce();
  });
});

describe("consumer errors", () => {
  it("stop all parses, also when refuseOutput throws", async () => {
    const session = sink();
    mocks.parse.mockImplementation((file: File) =>
      file.name === "save-0.sav" ? Promise.resolve({ name: file.name }) : new Promise(() => {}),
    );
    const run = importBatch(
      files(3),
      parser,
      session,
      options({
        refuseOutput: () => {
          throw Error("broken consumer");
        },
      }),
    );
    await expect(run).rejects.toThrow("broken consumer");
    expect(session.append).not.toHaveBeenCalled();
  });
});

describe("session clear", () => {
  it("during a parse stops the batch", async () => {
    mocks.parse.mockReturnValue(new Promise(() => {}));
    const session = sink();
    const run = importBatch(files(2), parser, session, options({ concurrency: 1 }));
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce());
    session.clear();
    expect((await run).files).toEqual(["cancelled", "cancelled"]);
    expect(session.append).not.toHaveBeenCalled();
  });

  it("across an append publishes nothing", async () => {
    const { promise: stored, resolve } = Promise.withResolvers<AppendResult<SnapshotDescriptor>>();
    const session = sink(() => stored);
    const opts = options({ concurrency: 1 });
    const run = importBatch(files(2), parser, session, opts);
    await vi.waitFor(() => expect(session.append).toHaveBeenCalledOnce());
    session.clear();
    resolve({ descriptor: descriptor("save-0.sav"), duplicate: false });
    expect((await run).files).toEqual(["cancelled", "cancelled"]);
    expect(opts.onCommitted).not.toHaveBeenCalled();
    expect(session.appended).toEqual([]);
  });
});

describe("memory", () => {
  it("stops new parses on a refusal, but active parses still append", async () => {
    const parses = new Map<string, (output: Output) => void>();
    mocks.parse.mockImplementation(
      (file: File) =>
        new Promise((resolve) => {
          parses.set(file.name, resolve);
        }),
    );
    const session = sink(async (output) => {
      if (output.name === "save-0.sav") throw memoryFull();
      return { descriptor: descriptor(output.name), duplicate: false };
    });
    const opts = options({ concurrency: 2 });
    const run = importBatch(files(4), parser, session, opts);
    await vi.waitFor(() => expect(parses.size).toBe(2));
    parses.get("save-0.sav")!({ name: "save-0.sav" });
    await vi.waitFor(() => expect(session.append).toHaveBeenCalledOnce());
    parses.get("save-1.sav")!({ name: "save-1.sav" });
    const result = await run;
    expect(result.files).toEqual(["refused", "accepted", "unprocessed", "unprocessed"]);
    expect(parses.size).toBe(2);
    expect(opts.onCommitted).toHaveBeenCalledOnce();
  });

  it("bounds output that waits for an append to the active parsers", async () => {
    const { promise: storage, resolve } = Promise.withResolvers<void>();
    const session = sink(async (output) => {
      await storage;
      return { descriptor: descriptor(output.name), duplicate: false };
    });
    const run = importBatch(files(12), parser, session, options({ concurrency: 3 }));
    await vi.waitFor(() => expect(session.append).toHaveBeenCalledTimes(3));
    // The parsers wait for storage, so they do not start another file.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocks.parse).toHaveBeenCalledTimes(3);
    resolve();
    expect((await run).outcomes.accepted).toBe(12);
  });

  it("runs fewer parsers when other sessions keep resident data", async () => {
    const admission = new AnalysisAdmission({ residentBytes: 1000 * MiB, parserBytes: 300 * MiB });
    admission.setResident("other-game", 150 * MiB);
    let active = 0;
    let peak = 0;
    mocks.parse.mockImplementation(async (file: File) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return { name: file.name };
    });
    const result = await importBatch(
      files(4),
      parser,
      sink(),
      options({ lease: admission.acquireImport(), concurrency: 4 }),
    );
    expect(peak).toBe(1);
    expect(result.outcomes.accepted).toBe(4);
  });

  it("stops a worker when the resident data grows, so its memory is free", async () => {
    const admission = new AnalysisAdmission({ residentBytes: 1000 * MiB, parserBytes: 300 * MiB });
    const session = sink(async (output) => {
      // The resident data grows with each snapshot.
      admission.setResident("test", 150 * MiB);
      return { descriptor: descriptor(output.name), duplicate: false };
    });
    // The number of stopped workers when each parse starts.
    const stopped: number[] = [];
    mocks.parse.mockImplementation(async (file: File) => {
      stopped.push(mocks.workers.filter((worker) => worker.terminate.mock.calls.length).length);
      return { name: file.name };
    });
    const result = await importBatch(
      files(3),
      parser,
      session,
      options({ lease: admission.acquireImport(), concurrency: 2 }),
    );
    expect(result.outcomes.accepted).toBe(3);
    // After the resident data grows, one worker stops before the last parse.
    expect(stopped).toEqual([0, 0, 1]);
    expect(mocks.workers.every((worker) => worker.terminate.mock.calls.length > 0)).toBe(true);
  });
});

it("reuses a parser worker within a batch and terminates it after the batch", async () => {
  mocks.parse.mockRejectedValueOnce(Error("invalid save"));
  const result = await importBatch(files(3), parser, sink(), options({ concurrency: 1 }));
  expect(result.files).toEqual(["failed", "accepted", "accepted"]);
  expect(mocks.workers).toHaveLength(1);
  expect(mocks.workers[0].terminate).toHaveBeenCalled();
});

it("fails a refused parser output and does not append it", async () => {
  const session = sink();
  const result = await importBatch(
    files(2),
    parser,
    session,
    options({
      refuseOutput: (output, file) =>
        output.name === "save-0.sav" && file.name === output.name ? "other campaign" : null,
    }),
  );
  expect(result.files).toEqual(["failed", "accepted"]);
  expect(result.failures).toEqual([{ fileName: "save-0.sav", error: "other campaign" }]);
  expect(session.appended).toEqual(["save-1.sav"]);
});

it("runs only the parsers that fit next to the resident data", async () => {
  // Memory for two of the four parsers.
  const admission = new AnalysisAdmission({ residentBytes: 1000 * MiB, parserBytes: 250 * MiB });
  const result = await importBatch(
    files(6),
    parser,
    sink(),
    options({ lease: admission.acquireImport(), concurrency: 4 }),
  );
  expect(result.outcomes.accepted).toBe(6);
  expect(mocks.workers).toHaveLength(2);
});

it("reports active files and clears them after a failure or cancellation", async () => {
  const controller = new AbortController();
  const failures = new Map<string, (error: Error) => void>();
  mocks.parse.mockImplementation(
    (file: File) =>
      new Promise((_resolve, reject) => {
        failures.set(file.name, reject);
      }),
  );
  const active: string[][] = [];
  const run = importBatch(
    files(3),
    parser,
    sink(),
    options({
      signal: controller.signal,
      concurrency: 2,
      onActiveFiles: (files) => active.push(files.map((file) => file.name)),
    }),
  );
  await vi.waitFor(() => expect(failures.size).toBe(2));
  expect(active.at(-1)).toEqual(["save-0.sav", "save-1.sav"]);
  failures.get("save-0.sav")!(Error("invalid save"));
  await vi.waitFor(() => expect(failures.size).toBe(3));
  expect(active.at(-1)).toEqual(["save-1.sav", "save-2.sav"]);
  controller.abort();
  expect((await run).files).toEqual(["failed", "cancelled", "cancelled"]);
  expect(active.at(-1)).toEqual([]);
});

it("stops new parses and throws when an outcome callback fails", async () => {
  const opts = options({
    concurrency: 1,
    onFileOutcome: () => {
      throw Error("status failed");
    },
  });
  await expect(importBatch(files(2), parser, sink(), opts)).rejects.toThrow("status failed");
  expect(mocks.parse).toHaveBeenCalledOnce();
});

it("stops new parses and throws when publication fails", async () => {
  const opts = options({
    concurrency: 1,
    onCommitted: () => {
      throw Error("sink failed");
    },
  });
  await expect(importBatch(files(2), parser, sink(), opts)).rejects.toThrow("sink failed");
  expect(mocks.parse).toHaveBeenCalledOnce();
});
