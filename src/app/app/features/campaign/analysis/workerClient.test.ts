import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FrameServer } from "./workerClient";
const mocks = vi.hoisted(() => ({
  api: { memory: vi.fn(), connectFrames: vi.fn(), disconnectFrames: vi.fn() },
  untrack: vi.fn(),
  workers: [] as Worker[],
}));
vi.mock("comlink", () => ({ wrap: () => mocks.api, transfer: (value: unknown) => value }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => mocks.untrack }));
type Api = FrameServer & { memory: () => number };
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

async function client() {
  const { createAnalysisWorker } = await import("./workerClient");
  const onFailure = vi.fn();
  const worker = createAnalysisWorker<Api>({ start: () => new Worker("worker.js"), onFailure });
  return { worker, onFailure };
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

it("disconnects game ports immediately when the storage worker fails", async () => {
  const { worker } = await client();
  const connect = vi.fn().mockResolvedValue(undefined);
  const disconnect = await worker.connectFrames(connect);
  const id = connect.mock.calls[0][0];
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(connect).toHaveBeenLastCalledWith(id, null);
  disconnect();
});
