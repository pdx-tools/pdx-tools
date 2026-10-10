import { wrap } from "comlink";
import type { Remote } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";

type Job = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export type WorkerQueueOptions = {
  /**
   * A worker that has no call to run for this long ends. Wasm memory does
   * not shrink, so the end of the worker frees what the largest call took.
   */
  idleMs: number;
  /**
   * A call that takes longer than this fails, and its worker ends. A worker
   * that crashed never answers, and it must not stop the calls after it.
   */
  timeoutMs: number;
};

export type WorkerQueue<Api> = {
  /**
   * Run one call on the worker. Calls run one at a time, in order. `label`
   * names the call in the timeout error.
   */
  run: <T>(call: (api: Remote<Api>) => Promise<T>, options?: { label?: string }) => Promise<T>;
  /** End the worker now. A later call starts a new worker. */
  terminate: () => void;
};

/**
 * A worker that starts on the first call and ends when it is idle. Use it
 * for work apart from the save on screen, so that this work does not wait
 * for the save and the memory of this work does not stay.
 *
 * `start` must construct the worker with `new Worker(new URL(...))` at its
 * call site, so that the bundler finds the worker module.
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
