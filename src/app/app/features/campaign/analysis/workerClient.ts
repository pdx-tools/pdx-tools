import { transfer, wrap } from "comlink";
import type { Remote } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";

/** The frame methods that an analysis worker gives to game workers. */
export type FrameServer = {
  connectFrames: (id: string, port: MessagePort) => void;
  disconnectFrames: (id: string) => void;
};

export type AnalysisWorkerOptions = {
  /** Construct the worker with new Worker(new URL(...)) so the bundler can find it. */
  start: () => Worker;
  /** Remove the state that the lost worker held. Calls after this start a new worker. */
  onFailure: (error: Error) => void;
};

export type AnalysisWorkerClient<Api extends FrameServer> = {
  /** The worker API. A worker failure rejects each pending call. */
  remote: () => Remote<Api>;
  /** Connect a game worker to the frames of this worker. Return the disconnect. */
  connectFrames: (
    connect: (id: string, port: MessagePort | null) => Promise<void>,
  ) => Promise<() => void>;
};

const FAILURE_MESSAGE =
  "Campaign analysis stopped unexpectedly. Reimport the original saves to rebuild it.";

/** Start one analysis worker when it is first used, and start a new one after a failure. */
export function createAnalysisWorker<Api extends FrameServer>({
  start,
  onFailure,
}: AnalysisWorkerOptions): AnalysisWorkerClient<Api> {
  let client: Remote<Api> | undefined;
  const frameConnections = new Map<string, () => void>();

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
    const failed = () => {
      if (client !== guarded) return;
      client = undefined;
      failure = new Error(FAILURE_MESSAGE);
      for (const reject of pending) reject(failure);
      pending.clear();
      for (const disconnect of frameConnections.values()) disconnect();
      worker.removeEventListener("error", failed);
      worker.removeEventListener("messageerror", failed);
      worker.terminate();
      untrack();
      onFailure(failure);
    };
    worker.addEventListener("error", failed);
    worker.addEventListener("messageerror", failed);
    client = guarded;
    return client;
  };

  let sequence = 0;
  const connectFrames: AnalysisWorkerClient<Api>["connectFrames"] = async (connect) => {
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

  return { remote, connectFrames };
}
