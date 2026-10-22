import { transfer, wrap } from "comlink";
import type { Remote } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";
import { isWorkerFailure } from "@/lib/workerQueue";
import { analysisAdmission } from "./admission";
import type { AnalysisAdmission, ImportLease } from "./admission";
import { MEMORY_LIMIT_ERROR, staleGenerationError } from "./session";
import type {
  AnalysisStore,
  AnswerValue,
  AppendReplyOf,
  QueryOf,
  QueryReply,
  SessionApi,
  SnapshotOf,
  SnapshotSelection,
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
  /** Remove the state that the lost worker held. Calls after this start a new worker. */
  onFailure: (error: Error) => void;
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
  remote: () => Remote<Pick<SessionApi<AnalysisStore>, "memory"> & FrameServer>;
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
  ) => Promise<AppendReplyOf<S>>;
  /** Release the snapshots of the campaign, or of any campaign, and stop imports. */
  clear: (campaignId?: string) => Promise<void>;
  /**
   * Keep only this campaign in the tab. Stop the workers of other games, and
   * this worker when it keeps another campaign, so their memory is released.
   */
  claim: (campaignId: string) => void;
  /** Stop the worker and forget its campaign. The next call starts a new worker. */
  release: () => void;
  /** Run a game query in the current generation. */
  query: <Q extends QueryOf<S>>(
    call: QueryCall<Q>,
  ) => Promise<QueryReply<AnswerValue<S, Q["kind"]>>>;
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
export function createAnalysisWorker<S extends AnalysisStore>({
  session,
  admission: custom,
  start,
  onFailure,
  onRelease = () => {},
  appendTimeoutMs = 60_000,
}: AnalysisWorkerOptions): AnalysisWorkerClient<S> {
  // The transport uses the shared store methods. The public methods above
  // give the types of the game store `S`.
  type Api = SessionApi<AnalysisStore> & FrameServer;
  // The shared admission reads the device memory, so get it when first used.
  const admission = () => custom ?? analysisAdmission();
  let client: Remote<Api> | undefined;
  /** Resolves when the current worker answers its open. */
  let ready: Promise<void> = Promise.resolve();
  /** Stop the current worker, as failed when an error is given. */
  let stopWorker: ((failure?: Error) => void) | undefined;
  let generation = 1;
  let stop = new AbortController();
  const frameConnections = new Map<string, () => void>();
  /** The last generation that removed all snapshots, and that removed each campaign. */
  let allCleared = generation;
  const campaignCleared = new Map<string, number>();
  /** The campaign that the worker keeps. */
  let campaign: string | null = null;

  /** Start a new generation. Without a campaign, all snapshots are gone. */
  const advance = (reason: unknown, campaignId?: string) => {
    generation++;
    if (campaignId === undefined) {
      allCleared = generation;
      campaignCleared.clear();
    } else campaignCleared.set(campaignId, generation);
    stop.abort(reason);
    stop = new AbortController();
  };
  const removedSince = (requested: number, campaignId: string) =>
    allCleared > requested || (campaignCleared.get(campaignId) ?? 0) > requested;

  const remote = (): Remote<Api> => {
    if (client) return client;
    const worker = start();
    const untrack = trackWorker(worker);
    const target = wrap<Api>(worker);
    const pending = new Set<(error: Error) => void>();
    let failure: Error | undefined;
    const guarded = new Proxy(target, {
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
      if (client !== guarded) return;
      client = undefined;
      stopWorker = undefined;
      failure = lost ?? new DOMException("Campaign analysis was released", "AbortError");
      for (const reject of pending) reject(failure);
      pending.clear();
      for (const disconnect of frameConnections.values()) disconnect();
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", failed);
      worker.terminate();
      untrack();
      advance(failure);
      campaign = null;
      admission().setResident(session, 0);
      if (lost) onFailure(lost);
    };
    const failed = () => stopped(new Error(FAILURE_MESSAGE));
    // An uncaught exception before the open reply can mean that the worker
    // module did not load, so the worker cannot answer.
    const onError = (event: Event) => {
      if (isWorkerFailure(event) || !opened) failed();
    };
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", failed);
    client = guarded;
    stopWorker = stopped;
    // The worker reads messages in order, so this comes before other calls.
    ready = guarded.open(generation).then(() => {
      opened = true;
    });
    ready.catch(() => {});
    return client;
  };

  const append: AnalysisWorkerClient<S>["append"] = async (requested, output, lease) => {
    if (!lease.active()) throw Error("Campaign analysis can only store snapshots of an import");
    if (requested !== generation) throw staleGenerationError();
    const api = remote();
    const fail = stopWorker;
    // Do not count the time that a new worker takes to load.
    await ready;
    // A worker that does not answer has failed. This rejects the append. The
    // worker stores appends one at a time, so the time includes earlier appends.
    const timer = setTimeout(() => fail?.(new Error(FAILURE_MESSAGE)), appendTimeoutMs);
    const reply = await api
      .append(
        requested,
        transfer(output.data, [output.data.buffer]) as never,
        lease.residentLimit(),
      )
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === MEMORY_LIMIT_ERROR)
          error.message = `Campaign analysis is full. It keeps at most ${mib(admission().limits.residentBytes)} of snapshots in memory.`;
        throw error;
      })
      .finally(() => clearTimeout(timer));
    // A clear after this append ends the generation, and the import stops.
    // The snapshot stays if the clear was for a different campaign. The
    // reply of the clear then has the memory of the worker.
    if (requested === generation) {
      campaign = reply.descriptor.campaignId;
      admission().setResident(session, reply.memory.bufferBytes);
    } else if (removedSince(requested, reply.descriptor.campaignId)) throw staleGenerationError();
    return reply as AppendReplyOf<S>;
  };

  const clear = async (campaignId?: string) => {
    advance(new DOMException("Campaign analysis was cleared", "AbortError"), campaignId);
    if (campaignId === undefined || campaignId === campaign) campaign = null;
    const memory = await remote().clear(generation, campaignId);
    admission().setResident(session, memory.bufferBytes);
  };

  const release = () => {
    if (stopWorker) stopWorker();
    else {
      advance(new DOMException("Campaign analysis was released", "AbortError"));
      campaign = null;
    }
    onRelease();
  };

  const claim = (campaignId: string) => {
    for (const other of sessions) if (other !== self) other.release();
    if (campaign !== null && campaign !== campaignId) release();
  };

  const query: AnalysisWorkerClient<S>["query"] = async (call) => {
    const { identity, sequence, campaignId, selection = { kind: "all" }, query } = call;
    const reply = await remote().query({ generation, campaignId, selection, query } as never);
    // Rust answers each query with the answer of its kind.
    const outcome =
      reply.outcome.status === "ok"
        ? { status: "ok" as const, value: reply.outcome.answer.value as never }
        : reply.outcome;
    return {
      generation: reply.generation,
      identity,
      sequence,
      snapshotIds: reply.snapshotIds,
      outcome,
    };
  };

  let sequence = 0;
  const connectFrames: AnalysisWorkerClient<S>["connectFrames"] = async (connect) => {
    const id = `frame:${++sequence}`;
    const channel = new MessageChannel();
    const storage = remote();
    const disconnect = () => {
      frameConnections.delete(id);
      void storage.disconnectFrames(id).catch(() => {});
      void connect(id, null).catch(() => {});
    };
    frameConnections.set(id, disconnect);
    try {
      await Promise.all([
        storage.connectFrames(id, transfer(channel.port1, [channel.port1])),
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

  const self: AnalysisWorkerClient<S> = {
    remote,
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
