import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalysisAdmission } from "./admission";
import type { QueryReply, QueryRequest, SnapshotData } from "@/wasm/wasm_eu5";
import type { SnapshotDescriptor } from "./descriptor";
import type { AnalysisStore, ResidentMemory } from "./session";

const mocks = vi.hoisted(() => ({
  api: {
    open: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    query: vi.fn(),
    memory: vi.fn(),
    connectFrames: vi.fn(),
    disconnectFrames: vi.fn(),
  },
  untrack: vi.fn(),
  workers: [] as Worker[],
}));
vi.mock("comlink", () => ({ wrap: () => mocks.api, transfer: (value: unknown) => value }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => mocks.untrack }));

/** A store class as `campaign_analysis::wasm_store!` declares it. */
type Store = AnalysisStore & {
  append(
    generation: number,
    data: SnapshotData<"test">,
    limitBytes: number,
  ): { descriptor: SnapshotDescriptor; duplicate: boolean; memory: ResidentMemory };
  query(request: QueryRequest<{ kind: "total" }>): QueryReply<{ kind: "total"; value: number }>;
};
const memory = (bufferBytes: number): ResidentMemory => ({
  bufferBytes,
  snapshots: 1,
  layouts: 0,
  indexBytes: 0,
  wasmBytes: 65536,
});
const output = (bytes = 80) => ({
  descriptor: { id: "test:1:a", campaignId: "campaign" } as SnapshotDescriptor,
  data: new Uint8Array(bytes) as SnapshotData<"test">,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workers = [];
  vi.stubGlobal(
    "Worker",
    class extends EventTarget {
      terminate = vi.fn();
      constructor() {
        super();
        mocks.workers.push(this as unknown as Worker);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

async function client(session = "test") {
  const { createFrameAnalysisWorker } = await import("./workerClient");
  const onFailure = vi.fn();
  const onRelease = vi.fn();
  const admission = new AnalysisAdmission({ residentBytes: 100, parserBytes: 1000 });
  const worker = createFrameAnalysisWorker<Store>({
    session,
    admission,
    start: () => new Worker("worker.js"),
    onFailure,
    onRelease,
  });
  return { worker, onFailure, onRelease, admission, lease: admission.acquireImport() };
}

it("rejects pending calls on worker failure and starts a new worker on the next call", async () => {
  const { worker, onFailure } = await client();
  mocks.api.memory.mockReturnValueOnce(new Promise(() => {})).mockResolvedValue(42);
  const old = worker.remote();
  const pending = old.memory();
  const failure = expect(pending).rejects.toThrow("Reimport");
  await vi.waitFor(() => expect(mocks.api.memory).toHaveBeenCalledOnce());
  mocks.workers[0].dispatchEvent(new Event("error"));
  await failure;
  expect(onFailure).toHaveBeenCalledOnce();
  expect(mocks.untrack).toHaveBeenCalledOnce();
  expect(mocks.workers[0].terminate).toHaveBeenCalledOnce();
  const next = worker.remote();
  expect(next).not.toBe(old);
  expect(mocks.workers).toHaveLength(2);
  expect(await next.memory()).toBe(42);
  await expect(old.memory()).rejects.toThrow("Reimport");
});

it("also rejects calls when worker messages cannot be decoded", async () => {
  const { worker } = await client();
  mocks.api.memory.mockReturnValue(new Promise(() => {}));
  const pending = worker.remote().memory();
  const failure = expect(pending).rejects.toThrow("Campaign analysis stopped");
  mocks.workers[0].dispatchEvent(new Event("messageerror"));
  await failure;
});

it("keeps the worker after an uncaught exception, as the worker queue does", async () => {
  const { worker, onFailure } = await client();
  mocks.api.memory.mockResolvedValue(42);
  worker.remote();
  await vi.waitFor(() => expect(mocks.api.open).toHaveBeenCalledOnce());
  await Promise.resolve();
  mocks.workers[0].dispatchEvent(Object.assign(new Event("error"), { message: "uncaught" }));
  expect(onFailure).not.toHaveBeenCalled();
  expect(mocks.workers[0].terminate).not.toHaveBeenCalled();
  expect(await worker.remote().memory()).toBe(42);
});

it("fails a worker that throws before it opens, as it cannot answer", async () => {
  const { worker, onFailure } = await client();
  mocks.api.open.mockReturnValue(new Promise(() => {}));
  worker.remote();
  mocks.workers[0].dispatchEvent(Object.assign(new Event("error"), { message: "bad module" }));
  expect(onFailure).toHaveBeenCalledOnce();
});

it("starts a new worker when the worker cannot open, such as after a failed WASM download", async () => {
  const { worker, onFailure, lease } = await client();
  mocks.api.open.mockRejectedValueOnce(new Error("download failed"));
  await expect(worker.append(1, output(), lease)).rejects.toThrow("download failed");
  expect(onFailure).toHaveBeenCalledOnce();
  expect(mocks.workers[0].terminate).toHaveBeenCalledOnce();
  mocks.api.append.mockResolvedValue({ descriptor: output().descriptor, memory: memory(80) });
  await worker.append(worker.generation(), output(), lease);
  expect(mocks.workers).toHaveLength(2);
});

it("fails the worker when an append does not answer", async () => {
  vi.useFakeTimers();
  try {
    const { createAnalysisWorker } = await import("./workerClient");
    const onFailure = vi.fn();
    const admission = new AnalysisAdmission({ residentBytes: 100, parserBytes: 1000 });
    const worker = createAnalysisWorker<Store>({
      session: "test",
      admission,
      start: () => new Worker("worker.js"),
      onFailure,
      appendTimeoutMs: 1000,
    });
    mocks.api.append.mockReturnValue(new Promise(() => {}));
    const pending = expect(worker.append(1, output(), admission.acquireImport())).rejects.toThrow(
      "Reimport",
    );
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(onFailure).toHaveBeenCalledOnce();
    expect(worker.generation()).toBe(2);
  } finally {
    vi.useRealTimers();
  }
});

it("disconnects game ports immediately when the storage worker fails", async () => {
  const { worker } = await client();
  const connect = vi.fn().mockResolvedValue(undefined);
  const disconnect = await worker.connectFrames(connect);
  const id = connect.mock.calls[0][0];
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(connect).toHaveBeenLastCalledWith(id, null);
  disconnect();
});

it("opens each new worker with the current generation", async () => {
  const { worker } = await client();
  worker.remote();
  await vi.waitFor(() => expect(mocks.api.open).toHaveBeenLastCalledWith(1));
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(worker.generation()).toBe(2);
  worker.remote();
  await vi.waitFor(() => expect(mocks.api.open).toHaveBeenLastCalledWith(2));
});

it("passes the limit of the lease and keeps the bytes that the worker reports", async () => {
  const { worker, admission, lease } = await client();
  mocks.api.append.mockResolvedValue({
    descriptor: output().descriptor,
    duplicate: false,
    memory: memory(30),
  });
  await worker.append(1, output(), lease);
  expect(mocks.api.append).toHaveBeenCalledWith(1, expect.anything(), 100);
  expect(admission.residentBytes()).toBe(30);
});

it("stops the worker on a release, and a claim of another campaign releases it", async () => {
  const { worker, admission, onFailure, onRelease, lease } = await client();
  mocks.api.append.mockResolvedValue({
    descriptor: output().descriptor,
    duplicate: false,
    memory: memory(30),
  });
  await worker.append(1, output(), lease);
  const signal = worker.signal();
  worker.claim("campaign");
  expect(mocks.workers[0].terminate).not.toHaveBeenCalled();
  worker.claim("next");
  expect(mocks.workers[0].terminate).toHaveBeenCalledOnce();
  expect(signal.aborted).toBe(true);
  expect(admission.residentBytes()).toBe(0);
  expect(onRelease).toHaveBeenCalledOnce();
  expect(onFailure).not.toHaveBeenCalled();
  // The next call starts a new worker.
  await worker.append(worker.generation(), output(), lease);
  expect(mocks.workers).toHaveLength(2);
});

it("releases the session of another game on a claim", async () => {
  const eu4 = await client("eu4");
  const eu5 = await client("eu5");
  eu4.worker.remote();
  eu5.worker.claim("campaign");
  expect(mocks.workers[0].terminate).toHaveBeenCalledOnce();
  expect(eu4.onRelease).toHaveBeenCalledOnce();
  expect(eu5.onRelease).not.toHaveBeenCalled();
});

it("refuses an append without an active import lease", async () => {
  const { worker, lease } = await client();
  lease.release();
  await expect(worker.append(1, output(), lease)).rejects.toThrow("only store snapshots");
  expect(mocks.api.append).not.toHaveBeenCalled();
});

it("forgets the resident data when the worker stops", async () => {
  const { worker, admission, lease } = await client();
  mocks.api.append
    .mockResolvedValueOnce({
      descriptor: output().descriptor,
      duplicate: false,
      memory: memory(30),
    })
    .mockReturnValue(new Promise(() => {}));
  await worker.append(1, output(), lease);
  expect(admission.residentBytes()).toBe(30);
  const pending = worker.append(1, output(), lease);
  const failure = expect(pending).rejects.toThrow("Reimport");
  await vi.waitFor(() => expect(mocks.api.append).toHaveBeenCalledTimes(2));
  mocks.workers[0].dispatchEvent(new Event("error"));
  await failure;
  expect(admission.residentBytes()).toBe(0);
});

it("ends the generation on a clear, so an import stops and its appends are stale", async () => {
  const { worker, admission, lease } = await client();
  const signal = worker.signal();
  const { promise: stored, resolve } = Promise.withResolvers<unknown>();
  mocks.api.append.mockReturnValue(stored);
  mocks.api.clear.mockResolvedValue(memory(0));
  const pending = worker.append(1, output(), lease);
  await vi.waitFor(() => expect(mocks.api.append).toHaveBeenCalledOnce());
  await worker.clear();
  expect(signal.aborted).toBe(true);
  expect(worker.signal().aborted).toBe(false);
  expect(mocks.api.clear).toHaveBeenCalledWith(2);
  // The worker stored the snapshot before it read the clear.
  resolve({ descriptor: output().descriptor, duplicate: false, memory: memory(80) });
  await expect(pending).rejects.toMatchObject({ name: "AnalysisStaleGeneration" });
  expect(admission.residentBytes()).toBe(0);
  await expect(worker.append(1, output(), lease)).rejects.toMatchObject({
    name: "AnalysisStaleGeneration",
  });
  expect(mocks.api.append).toHaveBeenCalledOnce();
});

it("stops a worker without snapshots when another campaign is claimed", async () => {
  const { worker, onFailure } = await client();
  worker.claim("campaign");
  worker.remote();
  worker.claim("next");
  expect(mocks.workers[0].terminate).toHaveBeenCalledOnce();
  worker.remote();
  mocks.workers[1].dispatchEvent(new Event("messageerror"));
  expect(onFailure).toHaveBeenCalledWith(expect.any(Error), "next");
});

it("sends each append without waiting for the reply before it", async () => {
  const { worker, lease } = await client();
  const { promise: stored, resolve } = Promise.withResolvers<unknown>();
  mocks.api.append.mockReturnValue(stored);
  const pending = [worker.append(1, output(), lease), worker.append(1, output(), lease)];
  // The worker stores them in order, and checks the limit for each.
  await vi.waitFor(() => expect(mocks.api.append).toHaveBeenCalledTimes(2));
  resolve({ descriptor: output().descriptor, duplicate: false, memory: memory(80) });
  await Promise.all(pending);
});

it("sends queries with the current generation and the requested snapshot selection", async () => {
  const { worker } = await client();
  mocks.api.clear.mockResolvedValue(memory(0));
  mocks.api.query.mockImplementation(async (request) => ({
    generation: request.generation,
    snapshotIds: ["a"],
    outcome: { status: "ok", answer: { kind: "total", value: 7 } },
  }));
  const call = { campaignId: "c", identity: "i", sequence: 3, query: { kind: "total" as const } };
  expect(await worker.query(call)).toEqual({
    generation: 1,
    identity: "i",
    sequence: 3,
    snapshotIds: ["a"],
    outcome: { status: "ok", value: 7 },
  });
  expect(mocks.api.query).toHaveBeenLastCalledWith({
    generation: 1,
    campaignId: "c",
    selection: { kind: "all" },
    query: { kind: "total" },
  });
  await worker.clear();
  await worker.query({ ...call, selection: { kind: "ids", ids: ["a"] } });
  expect(mocks.api.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ generation: 2, selection: { kind: "ids", ids: ["a"] } }),
  );
});
