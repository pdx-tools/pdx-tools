import { registerWebWorker } from "@sentry/react-router";
import init, { decompress_gamestate } from "@/wasm/wasm_compress";
import wasmPath from "@/wasm/wasm_compress_bg.wasm?url";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { ChunkWriter } from "./ring";

registerWebWorker({ self });

export type DecompressRequest = { save: Blob; ring: SharedArrayBuffer };
export type DecompressReply = { ready: true } | { error: string };

self.onmessage = async ({ data: { save, ring } }: MessageEvent<DecompressRequest>) => {
  try {
    await init({ module_or_path: wasmPath });
  } catch (error) {
    self.postMessage({ error: getErrorMessage(error) } satisfies DecompressReply);
    return;
  }

  // From here the reader blocks, so errors travel through the ring.
  self.postMessage({ ready: true } satisfies DecompressReply);
  const writer = new ChunkWriter(ring);
  try {
    decompress_gamestate(save, writer);
    writer.close();
  } catch (error) {
    writer.fail(getErrorMessage(error));
  }
  self.close();
};
