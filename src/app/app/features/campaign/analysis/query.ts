import type { QueryReply } from "./session";

/** During an import, a query runs again at most one time in this period. */
export const QUERY_REFRESH_MS = 1000;

export type QueryInput<R> = {
  /** The query and its arguments. The playhead is not part of it. */
  identity: string;
  /** The snapshot IDs that the query can read. A change runs the query again. */
  dataset: string;
  run: (() => Promise<QueryReply<R>>) | null;
};

export type QueryState<R> = { identity: string; result: R | null; error: string | null };

type Request = { identity: string; sequence: number; dataset: string; generation: number };

/**
 * The request lifecycle of one query subscription. A new query runs now. When
 * the dataset grows, the same query runs again, at most one time in each
 * `QUERY_REFRESH_MS`, and not while a request is pending. The previous result
 * stays until a newer result arrives.
 *
 * A reply is ignored when it is for another query, for an earlier request
 * than the shown result, or for another session generation.
 */
export class AnalysisQuery<R> {
  private input: QueryInput<R> | null = null;
  private state: QueryState<R> = { identity: "", result: null, error: null };
  private listeners = new Set<() => void>();
  private sequence = 0;
  private shown = 0;
  private pending: Request | null = null;
  private last: Request & { at: number } = {
    identity: "",
    sequence: 0,
    dataset: "",
    generation: 0,
    at: 0,
  };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly generation: () => number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  snapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  update(input: QueryInput<R>) {
    this.disposed = false;
    this.input = input;
    this.schedule();
  }

  /** Stop timers and ignore replies until the next update. */
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule() {
    const input = this.input;
    if (this.disposed || !input?.run) {
      clearTimeout(this.timer);
      this.timer = undefined;
      return;
    }
    const last = this.last;
    const same = last.identity === input.identity;
    const cleared = last.generation !== this.generation();
    if (same && last.dataset === input.dataset && !cleared) return;
    // A changed dataset waits for the pending request, then runs one time.
    if (same && this.pending?.identity === input.identity) return;
    if (this.timer && same && !cleared) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    // Only a growing dataset waits. A new query or a cleared session runs now.
    const wait = same && !cleared ? Math.max(0, QUERY_REFRESH_MS - (this.now() - last.at)) : 0;
    if (wait) this.timer = setTimeout(() => this.run(), wait);
    else this.run();
  }

  private run() {
    this.timer = undefined;
    const input = this.input;
    if (this.disposed || !input?.run) return;
    const request: Request = {
      identity: input.identity,
      sequence: ++this.sequence,
      dataset: input.dataset,
      generation: this.generation(),
    };
    this.last = { ...request, at: this.now() };
    this.pending = request;
    input.run().then(
      (reply) => this.settle(request, reply, null),
      (error) => this.settle(request, null, String(error)),
    );
  }

  private settle(request: Request, reply: QueryReply<R> | null, error: string | null) {
    if (this.pending === request) this.pending = null;
    if (this.disposed) return;
    const current =
      request.identity === this.input?.identity &&
      request.sequence > this.shown &&
      (reply ? reply.generation : request.generation) === this.generation();
    if (current) {
      this.shown = request.sequence;
      this.state = {
        identity: request.identity,
        result: reply ? reply.value : null,
        error,
      };
      for (const listener of this.listeners) listener();
    }
    this.schedule();
  }
}
