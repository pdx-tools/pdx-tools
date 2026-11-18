import { transfer, wrap } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";
import { isWorkerFailure } from "@/lib/workerQueue";
import { analysisAdmission } from "./admission";
import type { AnalysisAdmission, ImportLease } from "./admission";
import { MEMORY_LIMIT_ERROR, isAnswerOf, staleGenerationError } from "./session";
import type {
  AnalysisStore,
  AnswerValue,
  Async,
  QueryOf,
  QueryOutcome,
  QueryReply,
  SnapshotOf,
  SnapshotSelection,
  StoreApi,
  StoreAppendReply,
  StoreTypes,
  TypesOf,
} from "./session";

/** The frame methods that an analysis worker gives to game workers. */
export type FrameServer = {
  connectFrames: (id: string, port: MessagePort) => void;
  disconnectFrames: (id: string) => void;
};

export type AnalysisWorkerOptions = {
  /** The session name in the tab admission, such as the game. */
  session: string;
  admission?: AnalysisAdmission;
  /** Construct the worker with new Worker(new URL(...)) so the bundler can find it. */
  start: () => Worker;
  /**
   * Remove the state that the lost worker held, and stop the analysis of its
   * campaign. Calls after this start a new worker.
   */
  onFailure: (error: Error, campaignId: string | null) => void;
  /** Remove the state of a campaign that the session no longer keeps. */
  onRelease?: () => void;
  /** The time for an append, after which the worker has failed. */
  appendTimeoutMs?: number;
};

export type QueryCall<Q> = {
  campaignId: string;
  /** All snapshots of the campaign when not given. */
  selection?: SnapshotSelection;
  identity: string;
  sequence: number;
  query: Q;
};

export type AnalysisWorkerClient<S extends AnalysisStore> = {
  /**
   * The worker methods that do not change the store. A worker failure rejects
   * each pending call. Use `append` and `clear` to change the store.
   */
  remote: () => Pick<StoreApi<StoreTypes>, "memory">;
  /** Changes when the session clears, releases or the worker stops. */
  generation: () => number;
  /** Aborts when the current generation ends. */
  signal: () => AbortSignal;
  /**
   * Store parser output from an import that started in `generation`. The
   * import must hold the lease, which gives the resident limit.
   */
  append: (
    generation: number,
    output: SnapshotOf<S>,
    lease: ImportLease,
  ) => Promise<StoreAppendReply<TypesOf<S>>>;
  /** Release all snapshots of the campaign and stop imports. */
  clear: () => Promise<void>;
  /**
   * Keep only this campaign in the tab. Stop the workers of other games, and
   * this worker when it was for another campaign, so their memory is released.
   */
  claim: (campaignId: string) => void;
  /** Stop the worker and forget its campaign. The next call starts a new worker. */
  release: () => void;
  /** Run a game query in the current generation. */
  query: <Q extends QueryOf<S>>(
    call: QueryCall<Q>,
  ) => Promise<QueryReply<AnswerValue<TypesOf<S>, Q["kind"]>>>;
};

/** A client of a worker that also serves frames, as `frameServer` gives them. */
export type FrameAnalysisWorkerClient<S extends AnalysisStore> = AnalysisWorkerClient<S> & {
  /** Connect a game worker to the frames of this worker. Return the disconnect. */
  connectFrames: (
    connect: (id: string, port: MessagePort | null) => Promise<void>,
  ) => Promise<() => void>;
};

const FAILURE_MESSAGE =
  "Campaign analysis stopped unexpectedly. Reimport the original saves to rebuild it.";

/** The sessions of this tab. A claim releases the others. */
const sessions = new Set<{ release: () => void }>();

/** Start one analysis worker when it is first used, and start a new one after a failure. */
export function createAnalysisWorker<S extends AnalysisStore>(
  options: AnalysisWorkerOptions,
): AnalysisWorkerClient<S> {
  const { connectFrames: _, ...client } = createSession<S>(options);
  return client;
}

/** An analysis worker that also serves snapshot frames to game workers. */
export function createFrameAnalysisWorker<S extends AnalysisStore>(
  options: AnalysisWorkerOptions,
): FrameAnalysisWorkerClient<S> {
  return createSession<S>(options);
}

function createSession<S extends AnalysisStore>({
  session,
  admission: custom,
  start,
  onFailure,
  onRelease = () => {},
  appendTimeoutMs = 60_000,
}: AnalysisWorkerOptions): FrameAnalysisWorkerClient<S> {
  type Api = StoreApi<TypesOf<S>> & Async<FrameServer>;
  // The shared admission reads the device memory, so get it when first used.
  const admission = () => custom ?? analysisAdmission();
  /** One started worker. A call keeps the instance that it started on. */
  type Instance = {
    client: Api;
    /** Resolves when the worker answers its open. */
    ready: Promise<void>;
    /** The frame connections to this worker, by ID, with their disconnect. */
    frames: Map<string, () => void>;
    /** Stop the worker, as failed when an error is given. Later calls do nothing. */
    stop: (failure?: Error) => void;
  };
  let current: Instance | undefined;
  let generation = 1;
  let stop = new AbortController();
  /** The campaign of the last claim. The worker keeps only this campaign. */
  let claimed: string | null = null;

  /** Start a new generation. The snapshots of the earlier one are gone. */
  const advance = (reason: unknown) => {
    generation++;
    stop.abort(reason);
    stop = new AbortController();
  };

  const instance = (): Instance => {
    if (current) return current;
    const worker = start();
    const untrack = trackWorker(worker);
    // comlink's Remote wraps each argument in a conditional type, which
    // TypeScript cannot resolve for the bytes of a generic game. The Rust
    // store has these methods.
    const target = wrap(worker) as unknown as Api;
    const pending = new Set<(error: Error) => void>();
    let failure: Error | undefined;
    const client = new Proxy(target, {
      get: (target, key) => {
        const value: unknown = Reflect.get(target, key);
        if (typeof value !== "function") return value;
        const method = value as (...args: unknown[]) => unknown;
        return (...args: unknown[]) => {
          if (failure) return Promise.reject(failure);
          return new Promise((resolve, reject) => {
            pending.add(reject);
            void Promise.resolve()
              .then(() => {
                if (failure) throw failure;
                return method(...args);
              })
              .then(
                (value) => {
                  pending.delete(reject);
                  resolve(value);
                },
                (error) => {
                  pending.delete(reject);
                  reject(error);
                },
              );
          });
        };
      },
    });
    let opened = false;
    const stopped = (lost?: Error) => {
      if (current !== self) return;
      current = undefined;
      failure = lost ?? new DOMException("Campaign analysis was released", "AbortError");
      for (const reject of pending) reject(failure);
      pending.clear();
      for (const disconnect of self.frames.values()) disconnect();
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", failed);
      worker.terminate();
      untrack();
      advance(failure);
      admission().setResident(session, 0);
      if (lost) onFailure(lost, claimed);
    };
    const failed = () => stopped(new Error(FAILURE_MESSAGE));
    // An uncaught exception before the open reply can mean that the worker
    // module did not load, so the worker cannot answer.
    const onError = (event: Event) => {
      if (isWorkerFailure(event) || !opened) failed();
    };
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", failed);
    // The worker reads messages in order, so this comes before other calls.
    // A worker that cannot load its WASM fails each call, so start a new one.
    const ready = client.open(generation).then(
      () => {
        opened = true;
      },
      (error: unknown) => {
        stopped(new Error(FAILURE_MESSAGE, { cause: error }));
        throw error;
      },
    );
    ready.catch(() => {});
    const self: Instance = { client, ready, frames: new Map(), stop: stopped };
    current = self;
    return self;
  };

  const append: AnalysisWorkerClient<S>["append"] = async (requested, output, lease) => {
    if (!lease.active()) throw Error("Campaign analysis can only store snapshots of an import");
    if (requested !== generation) throw staleGenerationError();
    const worker = instance();
    // Do not count the time that a new worker takes to load.
    await worker.ready;
    // A worker that does not answer has failed. This rejects the append. The
    // worker stores appends one at a time, so the time includes earlier appends.
    const timer = setTimeout(() => worker.stop(new Error(FAILURE_MESSAGE)), appendTimeoutMs);
    const reply = await worker.client
      .append(requested, transfer(output.data, [output.data.buffer]), lease.residentLimit())
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === MEMORY_LIMIT_ERROR)
          error.message = `Campaign analysis is full. It keeps at most ${mib(admission().limits.residentBytes)} of snapshots in memory.`;
        throw error;
      })
      .finally(() => clearTimeout(timer));
    // A clear after this append removed the snapshot, and the import stops.
    if (requested !== generation) throw staleGenerationError();
    admission().setResident(session, reply.memory.bufferBytes);
    return reply;
  };

  const clear = async () => {
    advance(new DOMException("Campaign analysis was cleared", "AbortError"));
    const memory = await instance().client.clear(generation);
    admission().setResident(session, memory.bufferBytes);
  };

  const release = () => {
    if (current) current.stop();
    else advance(new DOMException("Campaign analysis was released", "AbortError"));
    claimed = null;
    onRelease();
  };

  const claim = (campaignId: string) => {
    for (const other of sessions) if (other !== self) other.release();
    if (claimed !== null && claimed !== campaignId) release();
    claimed = campaignId;
  };

  const query = async <Q extends QueryOf<S>>(
    call: QueryCall<Q>,
  ): Promise<QueryReply<AnswerValue<TypesOf<S>, Q["kind"]>>> => {
    const { identity, sequence, campaignId, selection = { kind: "all" }, query } = call;
    const reply = await instance().client.query({ generation, campaignId, selection, query });
    let outcome: QueryOutcome<AnswerValue<TypesOf<S>, Q["kind"]>> = { status: "stale" };
    if (reply.outcome.status === "ok") {
      const { answer } = reply.outcome;
      if (!isAnswerOf(answer, query.kind))
        throw Error(`The ${query.kind} query got the answer of another query`);
      outcome = { status: "ok", value: answer.value };
    }
    return {
      generation: reply.generation,
      identity,
      sequence,
      snapshotIds: reply.snapshotIds,
      outcome,
    };
  };

  let sequence = 0;
  const connectFrames: FrameAnalysisWorkerClient<S>["connectFrames"] = async (connect) => {
    const id = `frame:${++sequence}`;
    const channel = new MessageChannel();
    const storage = instance();
    const disconnect = () => {
      storage.frames.delete(id);
      void storage.client.disconnectFrames(id).catch(() => {});
      void connect(id, null).catch(() => {});
    };
    storage.frames.set(id, disconnect);
    try {
      await Promise.all([
        storage.client.connectFrames(id, transfer(channel.port1, [channel.port1])),
        connect(id, channel.port2),
      ]);
      return disconnect;
    } catch (error) {
      disconnect();
      channel.port1.close();
      channel.port2.close();
      throw error;
    }
  };

  const self: FrameAnalysisWorkerClient<S> = {
    remote: () => instance().client,
    generation: () => generation,
    signal: () => stop.signal,
    append,
    clear,
    claim,
    release,
    query,
    connectFrames,
  };
  sessions.add(self);
  return self;
}

const mib = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} MiB`;
