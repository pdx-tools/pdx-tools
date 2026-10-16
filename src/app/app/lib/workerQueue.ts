import { wrap } from "comlink";
import type { Remote } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";

type Job = {
  run: (signal: AbortSignal) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};

export type WorkerQueueOptions = {
  /** Release idle workers to free their WASM memory. */
  idleMs: number;
  /** End stalled workers so later calls can proceed. */
  timeoutMs: number;
  /** Release WASM high-water memory after each complete job. */
  recycleAfterJob?: boolean;
};

export type WorkerQueue<Api> = {
  /** Keep related calls on one worker. Observe signal around asynchronous host work. */
  run: <T>(
    call: (api: Remote<Api>, signal: AbortSignal) => Promise<T>,
    options?: { label?: string; signal?: AbortSignal },
  ) => Promise<T>;
  /** Reject outstanding jobs immediately; the queue can be used again. */
  terminate: (reason?: unknown) => void;
};

/** Construct workers with new Worker(new URL(...)) so the bundler can locate them. */
export function createWorkerQueue<Api>(
  start: () => Worker,
  { idleMs, timeoutMs, recycleAfterJob = false }: WorkerQueueOptions,
): WorkerQueue<Api> {
  const jobs: Job[] = [];
  let running = false;
  let active: { job: Job; cancel: (reason: unknown) => void } | undefined;
  let worker: { raw: Worker; api: Remote<Api>; cleanup: () => void } | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const abortError = () => new DOMException("Worker job stopped", "AbortError");

  function stopWorker() {
    clearTimeout(idle);
    idle = undefined;
    worker?.cleanup();
    worker?.raw.terminate();
    worker = undefined;
  }

  function api(): Remote<Api> {
    if (!worker) {
      const raw = start();
      const untrack = trackWorker(raw);
      // A worker that fails to load sends a plain error event. An uncaught
      // exception sends an ErrorEvent with a message, and the worker continues.
      const onError = (event: Event) => {
        if ((event as Partial<ErrorEvent>).message) return;
        if (active) active.cancel(new Error("Worker failed", { cause: event }));
        else stopWorker();
      };
      raw.addEventListener("error", onError);
      worker = {
        raw,
        api: wrap<Api>(raw),
        cleanup: () => {
          raw.removeEventListener("error", onError);
          untrack();
        },
      };
    }
    return worker.api;
  }

  async function drain() {
    if (running) return;
    running = true;
    clearTimeout(idle);
    idle = undefined;
    try {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        const controller = new AbortController();
        const { promise: interrupted, reject: interrupt } = Promise.withResolvers<never>();
        // Ignore a cancel after the call settles, so that it does not stop a healthy worker.
        let settled = false;
        let stopped: { reason: unknown } | undefined;
        active = {
          job,
          cancel: (reason) => {
            if (settled || stopped) return;
            stopped = { reason };
            controller.abort(reason);
            stopWorker();
            interrupt(reason);
          },
        };
        try {
          const call = job.run(controller.signal).finally(() => {
            settled = true;
          });
          const value = await Promise.race([call, interrupted]);
          // The call can settle after a cancel stops the worker. Reject it.
          if (stopped) throw stopped.reason;
          job.resolve(value);
        } catch (error) {
          job.reject(error);
        } finally {
          job.cleanup();
          active = undefined;
          if (recycleAfterJob) stopWorker();
        }
      }
    } finally {
      running = false;
      if (worker) idle = setTimeout(stopWorker, idleMs);
    }
  }

  return {
    run: (call, { label = "a worker call", signal } = {}) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason ?? abortError());
          return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const job: Job = {
          run: (jobSignal) => {
            timer = setTimeout(
              () => active?.cancel(new Error(`no answer for ${label} after ${timeoutMs} ms`)),
              timeoutMs,
            );
            return call(api(), jobSignal);
          },
          resolve: resolve as (value: unknown) => void,
          reject,
          cleanup: () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
          },
        };
        const cancel = () => {
          const reason = signal?.reason ?? abortError();
          if (active?.job === job) active.cancel(reason);
          else {
            const index = jobs.indexOf(job);
            if (index !== -1) jobs.splice(index, 1);
            job.cleanup();
            reject(reason);
          }
        };
        signal?.addEventListener("abort", cancel, { once: true });
        jobs.push(job);
        void drain();
      }),
    terminate: (reason = abortError()) => {
      active?.cancel(reason);
      // Stop the worker also when no job is active or the active call is settled.
      stopWorker();
      for (const job of jobs.splice(0)) {
        job.cleanup();
        job.reject(reason);
      }
    },
  };
}
