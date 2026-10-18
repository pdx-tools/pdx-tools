import { wrap, transfer } from "comlink";
import type { Remote } from "comlink";
import type { analysisApi } from "./analysis-worker";
import type { SaveAnalysis } from "./analysisTypes";
import { analyticalBuffers } from "./transferBuffers";
import { trackWorker } from "@/lib/sentryWorker";
import { useHistory } from "./store";
let client: Remote<typeof analysisApi> | undefined;
const frameConnections = new Map<string, () => void>();
export function campaignAnalysis(): Remote<typeof analysisApi> {
  if (!client) {
    const worker = new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" });
    const untrack = trackWorker(worker);
    const remote = wrap<typeof analysisApi>(worker);
    const pending = new Set<(error: Error) => void>();
    let failure: Error | undefined;
    const guarded = new Proxy(remote, {
      get: (target, key) => {
        const method = Reflect.get(target, key);
        if (typeof method !== "function") return method;
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
      const message =
        "Campaign analysis stopped unexpectedly. Reimport the original saves to rebuild it.";
      failure = new Error(message);
      for (const reject of pending) reject(failure);
      pending.clear();
      for (const disconnect of frameConnections.values()) disconnect();
      worker.removeEventListener("error", failed);
      worker.removeEventListener("messageerror", failed);
      worker.terminate();
      untrack();
      useHistory.getState().cancel?.();
      const history = useHistory.getState();
      useHistory.setState({
        snapshots: [],
        sources: {},
        analysisPaused: true,
        analysisPausedCampaigns: [
          ...new Set([
            ...history.analysisPausedCampaigns,
            ...history.snapshots.map((snapshot) => snapshot.campaignId),
          ]),
        ],
        issues: [message],
      });
    };
    worker.addEventListener("error", failed);
    worker.addEventListener("messageerror", failed);
    client = guarded;
  }
  return client;
}
export function appendAnalysis(save: SaveAnalysis) {
  return campaignAnalysis().append(transfer(save, analyticalBuffers(save)));
}

let frameConnectionSequence = 0;
export async function connectAnalysisFrames(
  connect: (id: string, port: MessagePort | null) => Promise<void>,
) {
  const id = `frame:${++frameConnectionSequence}`;
  const channel = new MessageChannel();
  const storage = campaignAnalysis();
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
}
