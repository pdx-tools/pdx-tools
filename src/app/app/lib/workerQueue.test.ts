import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkerQueue } from "./workerQueue";

vi.mock("comlink", () => ({ wrap: (raw: unknown) => raw }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: vi.fn() }));

type Api = { echo: (value: string) => Promise<string> };
type FakeWorker = Api & { terminate: ReturnType<typeof vi.fn> };

function setup({ idleMs = 1_000, timeoutMs = 5_000 } = {}) {
  const workers: FakeWorker[] = [];
  const calls: string[] = [];
  const gates = new Map<string, () => void>();
  const start = () => {
    const worker: FakeWorker = {
      echo: (value) =>
        new Promise((resolve) => {
          calls.push(value);
          if (value.startsWith("wait")) gates.set(value, () => resolve(value));
          else resolve(value);
        }),
      terminate: vi.fn(),
    };
    workers.push(worker);
    return worker as unknown as Worker;
  };
  const queue = createWorkerQueue<Api>(start, { idleMs, timeoutMs });
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
