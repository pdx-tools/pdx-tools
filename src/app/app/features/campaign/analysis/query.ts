import type { QueryReply } from "./session";

/** During an import, a query runs again at most one time in this period. */
export const QUERY_REFRESH_MS = 1000;

export type QueryInput<R> = {
  /** The query, its campaign and its selection. The playhead is not part of it. */
  identity: string;
  /** The snapshot IDs that the session has for the query. A change runs the query again. */
  dataset: string;
  /** Null when the query cannot run now. */
  run: ((identity: string, sequence: number) => Promise<QueryReply<R>>) | null;
};

export type QueryState<R> = {
  identity: string;
  generation: number;
  result: R | null;
  /** The snapshots that the result used, in date order. */
  snapshotIds: readonly string[];
  error: string | null;
};

type Request = {
  identity: string;
  dataset: string;
  generation: number;
  sequence: number;
  activation: number;
};

const EMPTY: QueryState<never> = {
  identity: "",
  generation: 0,
  result: null,
  snapshotIds: [],
  error: null,
};

/**
 * The request lifecycle of one query subscription.
 *
 * - A new query, or the same query after a clear or a deactivation, runs now.
 * - When the dataset changes, the same query runs again at most one time in
 *   each `QUERY_REFRESH_MS`. The previous result stays until the next one.
 * - While a request is pending, changes wait. Then the query runs one time on
 *   the latest dataset.
 * - A reply is ignored when it is for another query, for another session
 *   generation, for an earlier activation, or for a request older than the
 *   shown result.
 */
export class AnalysisQuery<R> {
  private input: QueryInput<R> | null = null;
  private state: QueryState<R> = EMPTY;
  private listeners = new Set<() => void>();
  private sequence = 0;
  private shown = 0;
  private pending: Request | null = null;
  private last: (Request & { at: number }) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  /** Changes on each activation, so the replies of an earlier one are ignored. */
  private activation = 0;

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

  /** The state for a query identity in the current generation, or an empty state. */
  current(identity: string): QueryState<R> {
    const { state } = this;
    return state.identity === identity && state.generation === this.generation() ? state : EMPTY;
  }

  /** Set the query. The first update after a deactivation activates the query. */
  update(input: QueryInput<R>) {
    if (!this.active) {
      this.active = true;
      this.activation++;
    }
    this.input = input;
    this.schedule();
  }

  /**
   * Stop timers and ignore the replies of this activation. The shown result
   * stays until a reply of the next activation replaces it.
   */
  deactivate() {
    this.active = false;
    this.cancelTimer();
    this.pending = null;
    this.last = null;
  }

  private cancelTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule() {
    const input = this.input;
    if (!this.active || !input?.run) return this.cancelTimer();
    const generation = this.generation();
    const { last, pending } = this;
    const same = last?.identity === input.identity && last.generation === generation;
    if (same && last.dataset === input.dataset) return this.cancelTimer();
    if (same) {
      // A changed dataset waits for the pending request or the timer.
      if (pending?.identity === input.identity && pending.generation === generation) return;
      if (this.timer) return;
      const wait = Math.max(0, QUERY_REFRESH_MS - (this.now() - last.at));
      if (wait) {
        this.timer = setTimeout(() => this.run(), wait);
        return;
      }
    }
    this.cancelTimer();
    this.run();
  }

  private run() {
    this.timer = undefined;
    const input = this.input;
    if (!this.active || !input?.run) return;
    const request: Request = {
      identity: input.identity,
      dataset: input.dataset,
      generation: this.generation(),
      sequence: ++this.sequence,
      activation: this.activation,
    };
    this.last = { ...request, at: this.now() };
    this.pending = request;
    input.run(request.identity, request.sequence).then(
      (reply) => this.settle(request, reply, null),
      (error) => this.settle(request, null, String(error)),
    );
  }

  private settle(request: Request, reply: QueryReply<R> | null, error: string | null) {
    if (this.pending === request) this.pending = null;
    if (!this.active || request.activation !== this.activation) return;
    const generation = this.generation();
    const current =
      request.identity === this.input?.identity &&
      request.generation === generation &&
      request.sequence > this.shown &&
      (!reply ||
        (reply.generation === generation &&
          reply.identity === request.identity &&
          reply.sequence === request.sequence));
    if (current && reply?.outcome.status !== "stale") {
      this.shown = request.sequence;
      const outcome = reply?.outcome;
      this.state = {
        identity: request.identity,
        generation,
        result: outcome?.status === "ok" ? outcome.value : null,
        snapshotIds: reply?.snapshotIds ?? [],
        error,
      };
      for (const listener of this.listeners) listener();
    }
    this.schedule();
  }
}
