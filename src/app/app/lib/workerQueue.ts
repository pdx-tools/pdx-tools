import { wrap } from "comlink";
import type { Remote } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";

type Job = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export type WorkerQueueOptions = {
  /** Release idle workers to free their WASM memory. */
  idleMs: number;
  /** End stalled workers so later calls can proceed. */
  timeoutMs: number;
};

export type WorkerQueue<Api> = {
  /** Serialize worker calls and identify timeout errors with `label`. */
  run: <T>(call: (api: Remote<Api>) => Promise<T>, options?: { label?: string }) => Promise<T>;

  terminate: () => void;
};

/**
 * Run background work in a worker that releases its memory when idle.
 * Construct workers with `new Worker(new URL(...))` so the bundler can locate them.
 */
export function createWorkerQueue<Api>(
  start: () => Worker,
  { idleMs, timeoutMs }: WorkerQueueOptions,
): WorkerQueue<Api> {
  const jobs: Job[] = [];
  let running = false;
  let worker: { raw: Worker; api: Remote<Api> } | null = null;
  let idle: ReturnType<typeof setTimeout> | null = null;

  const terminate = () => {
    if (idle !== null) clearTimeout(idle);
    idle = null;
    worker?.raw.terminate();
    worker = null;
  };

  const api = (): Remote<Api> => {
    if (worker === null) {
      const raw = start();
      trackWorker(raw);
      worker = { raw, api: wrap<Api>(raw) };
    }
    return worker.api;
  };

  const withTimeout = async <T>(task: () => Promise<T>, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        terminate();
        reject(new Error(`no answer for ${label} after ${timeoutMs} ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([task(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  const drain = async () => {
    if (running) return;
    running = true;
    if (idle !== null) clearTimeout(idle);
    idle = null;

    try {
      for (let job = jobs.shift(); job !== undefined; job = jobs.shift()) {
        try {
          job.resolve(await job.run());
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      running = false;
      idle = setTimeout(terminate, idleMs);
    }
  };

  return {
    run: (call, { label = "a worker call" } = {}) =>
      new Promise((resolve, reject) => {
        const job: Job = {
          run: () => withTimeout(() => call(api()), label),
          resolve: resolve as (value: unknown) => void,
          reject,
        };
        jobs.push(job);
        void drain();
      }),
    terminate,
  };
}
