import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ParserAdmission } from "./admission";
import type { AnalysisWorkerApi } from "./workerClient";
const mocks = vi.hoisted(() => ({
  api: {
    open: vi.fn(),
    clear: vi.fn(),
    memory: vi.fn(),
    connectFrames: vi.fn(),
    disconnectFrames: vi.fn(),
  },
  untrack: vi.fn(),
  workers: [] as Worker[],
}));
vi.mock("comlink", () => ({ wrap: () => mocks.api, transfer: (value: unknown) => value }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => mocks.untrack }));
type Api = AnalysisWorkerApi;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.open.mockResolvedValue(undefined);
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

async function client() {
  const { createAnalysisWorker } = await import("./workerClient");
  const onFailure = vi.fn();
  const admission = new ParserAdmission(Infinity);
  const worker = createAnalysisWorker<Api>({
    session: "test",
    admission: () => admission,
    start: () => new Worker("worker.js"),
    onFailure,
  });
  return { worker, onFailure, admission };
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
  expect(await next.memory()).toBe(42 as never);
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

it("disconnects game ports immediately when the storage worker fails", async () => {
  const { worker } = await client();
  const connect = vi.fn().mockResolvedValue(undefined);
  const disconnect = await worker.connectFrames(connect);
  const id = connect.mock.calls[0][0];
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(connect).toHaveBeenLastCalledWith(id, null);
  disconnect();
});

it("gives each worker and each clear a new generation, and releases resident memory", async () => {
  const { worker, admission } = await client();
  const memory = { bufferBytes: 10, stringBytes: 2, indexBytes: 1 };
  mocks.api.memory.mockResolvedValue(memory);
  worker.remote();
  await vi.waitFor(() => expect(mocks.api.open).toHaveBeenLastCalledWith(1));
  await worker.refreshResident();
  expect(admission.usage().residentBytes).toBe(13);
  await worker.clear("campaign");
  expect(worker.generation()).toBe(2);
  expect(mocks.api.clear).toHaveBeenCalledWith(2, "campaign");
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(worker.generation()).toBe(3);
  expect(admission.usage().residentBytes).toBe(0);
  worker.remote();
  await vi.waitFor(() => expect(mocks.api.open).toHaveBeenLastCalledWith(3));
});
