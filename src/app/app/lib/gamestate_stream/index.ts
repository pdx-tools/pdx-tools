import { isWorkerFailure } from "@/lib/workerQueue";
import { trackWorker } from "@/lib/sentryWorker";
import { ChunkReader, createChunkRing } from "./ring";
import type { DecompressReply, DecompressRequest } from "./worker";

export type GamestateStream = {
  /**
   * The parser's reader, or `undefined` when the worker fails to start.
   * Await it before reading: Chrome loads a nested worker's scripts on the
   * parent's event loop, so a read that blocks earlier never returns.
   */
  source: Promise<ChunkReader | undefined>;
  close: () => void;
};

/**
 * Decompress the gamestate of `save` in a new worker while this one parses it.
 * The ring is a `SharedArrayBuffer`, which relies on the cross-origin
 * isolation that the EU5 map also requires.
 */
export function streamGamestate(save: Blob): GamestateStream {
  // 1 MiB slots match the chunks that `decompress_gamestate` writes.
  const ring = createChunkRing();
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const untrack = trackWorker(worker);
  const source = Promise.withResolvers<ChunkReader | undefined>();

  // Sentry posts to the same port, so act only on replies.
  worker.onmessage = ({ data }: MessageEvent<Partial<DecompressReply>>) => {
    if ("ready" in data) {
      source.resolve(new ChunkReader(ring));
    } else if ("error" in data) {
      console.warn(`Gamestate worker failed: ${data.error}`);
      source.resolve(undefined);
    }
  };
  worker.onerror = (event) => {
    if (!isWorkerFailure(event)) return;
    event.preventDefault();
    console.warn("Gamestate worker failed to load");
    source.resolve(undefined);
  };
  worker.postMessage({ save, ring } satisfies DecompressRequest);

  return {
    source: source.promise,
    close: () => {
      untrack();
      worker.terminate();
    },
  };
}
