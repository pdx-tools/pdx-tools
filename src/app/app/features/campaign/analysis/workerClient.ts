import { transfer, wrap } from "comlink";
import type { Remote } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";
import { isWorkerFailure } from "@/lib/workerQueue";
import { analysisAdmission } from "./admission";
import type { AnalysisAdmission, ImportLease } from "./admission";
import type { SnapshotDescriptor } from "./descriptor";
import { MEMORY_LIMIT_ERROR } from "./residentStore";
import type { ResidentSnapshot } from "./residentStore";
import { staleGenerationError } from "./session";
import type { AppendReply, SessionApi } from "./session";
import { collectBuffers } from "./transferBuffers";

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
  /** The time for an append, after which the worker has failed. */
  appendTimeoutMs?: number;
};

export type AnalysisWorkerClient<D extends SnapshotDescriptor, P> = {
  /**
   * The worker methods that do not change the store. A worker failure rejects
   * each pending call. Use `append` and `clear` to change the store.
   */
  remote: () => Remote<Pick<SessionApi<D, P>, "memory"> & FrameServer>;
  /** Changes when the session clears or the worker stops. */
  generation: () => number;
  /** Aborts when the current generation ends. */
  signal: () => AbortSignal;
  /**
   * Store parser output from an import that started in `generation`. The
   * import must hold the lease, which gives the resident limit.
   */
  append: (
    generation: number,
    output: ResidentSnapshot<D, P>,
    lease: ImportLease,
  ) => Promise<AppendReply<D>>;
  /** Release the snapshots of one campaign, or of all campaigns, and stop imports. */
  clear: (campaignId?: string) => Promise<void>;
  /** Connect a game worker to the frames of this worker. Return the disconnect. */
  connectFrames: (
    connect: (id: string, port: MessagePort | null) => Promise<void>,
  ) => Promise<() => void>;
};

const FAILURE_MESSAGE =
  "Campaign analysis stopped unexpectedly. Reimport the original saves to rebuild it.";

/** Start one analysis worker when it is first used, and start a new one after a failure. */
export function createAnalysisWorker<D extends SnapshotDescriptor, P>({
  session,
  admission: custom,
  start,
  onFailure,
  appendTimeoutMs = 60_000,
}: AnalysisWorkerOptions): AnalysisWorkerClient<D, P> {
  type Api = SessionApi<D, P> & FrameServer;
  // The shared admission reads the device memory, so get it when first used.
  const admission = () => custom ?? analysisAdmission();
  let client: Remote<Api> | undefined;
  /** Resolves when the current worker answers its open. */
  let ready: Promise<void> = Promise.resolve();
  /** Stop the current worker as failed. */
  let fail: (() => void) | undefined;
  let generation = 1;
  let stop = new AbortController();
  const frameConnections = new Map<string, () => void>();
  /** The last generation that removed all snapshots, and that removed each campaign. */
  let allCleared = generation;
  const campaignCleared = new Map<string, number>();

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
    const failed = () => {
      if (client !== guarded) return;
      client = undefined;
      fail = undefined;
      failure = new Error(FAILURE_MESSAGE);
      for (const reject of pending) reject(failure);
      pending.clear();
      for (const disconnect of frameConnections.values()) disconnect();
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", failed);
      worker.terminate();
      untrack();
      advance(failure);
      admission().setResident(session, 0);
      onFailure(failure);
    };
    // An uncaught exception before the open reply can mean that the worker
    // module did not load, so the worker cannot answer.
    const onError = (event: Event) => {
      if (isWorkerFailure(event) || !opened) failed();
    };
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", failed);
    client = guarded;
    fail = failed;
    // The worker reads messages in order, so this comes before other calls.
    ready = guarded.open(generation).then(() => {
      opened = true;
    });
    ready.catch(() => {});
    return client;
  };

  const append: AnalysisWorkerClient<D, P>["append"] = async (requested, output, lease) => {
    // Other sessions do not grow during an import, so the limit stays valid.
    if (!lease.active()) throw Error("Campaign analysis can only store snapshots of an import");
    if (requested !== generation) throw staleGenerationError();
    const buffers = collectBuffers(output);
    const api = remote();
    const stopWorker = fail;
    // Do not count the time that a new worker takes to load.
    await ready;
    // A worker that does not answer has failed. This rejects the append. The
    // worker stores appends one at a time, so the time includes earlier appends.
    const timer = setTimeout(() => stopWorker?.(), appendTimeoutMs);
    const reply = await api
      .append(requested, transfer(output, buffers), lease.residentLimit(session))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === MEMORY_LIMIT_ERROR)
          error.message = `Campaign analysis is full. It keeps at most ${mib(admission().limits.residentBytes)} of snapshots in memory.`;
        throw error;
      })
      .finally(() => clearTimeout(timer));
    // A clear after this append ends the generation, and the import stops.
    // The snapshot stays if the clear was for a different campaign. The
    // reply of the clear then has the memory of the worker.
    if (requested === generation) admission().setResident(session, reply.memory.bufferBytes);
    else if (removedSince(requested, reply.descriptor.campaignId)) throw staleGenerationError();
    return reply;
  };

  const clear = async (campaignId?: string) => {
    advance(new DOMException("Campaign analysis was cleared", "AbortError"), campaignId);
    const memory = await remote().clear(generation, campaignId);
    admission().setResident(session, memory.bufferBytes);
  };

  let sequence = 0;
  const connectFrames: AnalysisWorkerClient<D, P>["connectFrames"] = async (connect) => {
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

  return {
    remote,
    generation: () => generation,
    signal: () => stop.signal,
    append,
    clear,
    connectFrames,
  };
}

const mib = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} MiB`;
