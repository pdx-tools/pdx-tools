import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkerQueue } from "./workerQueue";

vi.mock("comlink", () => ({ wrap: (raw: unknown) => raw }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: vi.fn(() => vi.fn()) }));

type Api = { echo: (value: string) => Promise<string> };
type FakeWorker = EventTarget & Api & { terminate: ReturnType<typeof vi.fn> };

function setup({ idleMs = 1_000, timeoutMs = 5_000, recycleAfterJob = false } = {}) {
  const workers: FakeWorker[] = [];
  const calls: string[] = [];
  const gates = new Map<string, () => void>();
  const start = () => {
    const worker: FakeWorker = Object.assign(new EventTarget(), {
      echo: (value: string) =>
        new Promise<string>((resolve) => {
          calls.push(value);
          if (value.startsWith("wait")) gates.set(value, () => resolve(value));
          else resolve(value);
        }),
      terminate: vi.fn(),
    });
    workers.push(worker);
    return worker as unknown as Worker;
  };
  const queue = createWorkerQueue<Api>(start, { idleMs, timeoutMs, recycleAfterJob });
  return { queue, workers, calls, gates };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createWorkerQueue", () => {
  it("runs calls one at a time, in order", async () => {
    const { queue, calls, gates } = setup();
    const first = queue.run((api) => api.echo("wait-first"));
    const second = queue.run((api) => api.echo("second"));
    await vi.waitFor(() => expect(gates.has("wait-first")).toBe(true));
    expect(calls).toEqual(["wait-first"]);

    gates.get("wait-first")!();
    await expect(Promise.all([first, second])).resolves.toEqual(["wait-first", "second"]);
    expect(calls).toEqual(["wait-first", "second"]);
  });

  it("ends the worker when idle and starts a new one for the next call", async () => {
    const { queue, workers } = setup({ idleMs: 1_000 });
    await queue.run((api) => api.echo("a"));
    expect(workers).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(workers[0].terminate).toHaveBeenCalledOnce();

    await queue.run((api) => api.echo("b"));
    expect(workers).toHaveLength(2);
  });

  it("rejects a parse failure and reuses the same worker for the next save", async () => {
    const { queue, workers } = setup();
    await queue.run((api) => api.echo("first save"));
    const parseError = new Error("missing field morale");
    vi.spyOn(workers[0], "echo").mockRejectedValueOnce(parseError);

    const failed = queue.run((api) => api.echo("invalid save"));
    const next = queue.run((api) => api.echo("next save"));

    await expect(failed).rejects.toBe(parseError);
    await expect(next).resolves.toBe("next save");
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    queue.terminate();
  });

  it("fails a call that takes too long and does not stop the calls after it", async () => {
    const { queue, workers } = setup({ timeoutMs: 5_000 });
    const stuck = queue.run((api) => api.echo("wait-forever"), { label: "the stuck call" });
    const next = queue.run((api) => api.echo("next"));
    const failure = expect(stuck).rejects.toThrow("no answer for the stuck call after 5000 ms");

    await vi.advanceTimersByTimeAsync(5_000);
    await failure;
    await expect(next).resolves.toBe("next");
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
  });
});

it("rejects active and queued jobs on termination and permits later work", async () => {
  const { queue, workers, gates } = setup();
  const first = queue.run((api) => api.echo("wait-first"));
  const next = queue.run((api) => api.echo("next"));
  const firstFailure = expect(first).rejects.toMatchObject({ name: "AbortError" });
  const nextFailure = expect(next).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(gates.has("wait-first")).toBe(true));
  queue.terminate();
  await Promise.all([firstFailure, nextFailure]);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  await expect(queue.run((api) => api.echo("fresh"))).resolves.toBe("fresh");
  expect(workers).toHaveLength(2);
});

it("cancels a queued job without interrupting the active worker", async () => {
  const { queue, workers, gates, calls } = setup();
  const controller = new AbortController();
  const first = queue.run((api) => api.echo("wait-first"));
  const cancelled = queue.run((api) => api.echo("cancelled"), { signal: controller.signal });
  const failure = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await failure;
  expect(workers[0].terminate).not.toHaveBeenCalled();
  gates.get("wait-first")!();
  await first;
  expect(calls).toEqual(["wait-first"]);
});

it("cancels active work immediately and signals asynchronous host callbacks", async () => {
  const { queue, workers } = setup();
  const controller = new AbortController();
  let jobSignal: AbortSignal | undefined;
  const job = queue.run(
    (api, signal) => {
      jobSignal = signal;
      return api.echo("wait-active");
    },
    { signal: controller.signal },
  );
  const failure = expect(job).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await failure;
  expect(jobSignal?.aborted).toBe(true);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});

it("rejects a worker crash and runs the next job on a fresh worker", async () => {
  const { queue, workers } = setup();
  const failed = queue.run((api) => api.echo("wait-crash"));
  const next = queue.run((api) => api.echo("next"));
  const failure = expect(failed).rejects.toThrow("Worker failed");
  workers[0].dispatchEvent(new Event("error"));
  await failure;
  await expect(next).resolves.toBe("next");
  expect(workers).toHaveLength(2);
});

it("discards an errored idle worker before accepting more work", async () => {
  const { queue, workers } = setup();
  await expect(queue.run((api) => api.echo("first"))).resolves.toBe("first");
  workers[0].dispatchEvent(new Event("error"));
  expect(workers[0].terminate).toHaveBeenCalledOnce();

  await expect(queue.run((api) => api.echo("next"))).resolves.toBe("next");
  expect(workers).toHaveLength(2);
  workers[0].dispatchEvent(new Event("error"));
  expect(workers[1].terminate).not.toHaveBeenCalled();
  queue.terminate();
});

it("keeps a complete job on one worker and recycles between jobs", async () => {
  const { queue, workers, calls } = setup({ recycleAfterJob: true });
  await queue.run(async (api) => {
    await api.echo("parse");
    expect(workers[0].terminate).not.toHaveBeenCalled();
    return api.echo("cache");
  });
  expect(calls).toEqual(["parse", "cache"]);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  await queue.run((api) => api.echo("second-save"));
  expect(workers).toHaveLength(2);
  expect(workers[1].terminate).toHaveBeenCalledOnce();
});

it("does not create a worker for an already cancelled job", async () => {
  const { queue, workers } = setup();
  const controller = new AbortController();
  controller.abort();
  await expect(
    queue.run((api) => api.echo("never"), { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(workers).toHaveLength(0);
});
