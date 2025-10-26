import { expose, transfer } from "comlink";
import init, * as wasmModule from "../../wasm/wasm_compress";
import wasmPath from "../../wasm/wasm_compress_bg.wasm?url";
import { timeSync } from "@/lib/timeit";
import { formatInt } from "@/lib/format";
import { logMs } from "@/lib/log";

export type ProgressCb = (portion: number) => void;

export const obj = {
  async loadWasm() {
    await init(wasmPath);
  },

  compress(data: Uint8Array<ArrayBuffer>, cb: ProgressCb) {
    const compression = timeSync(() => wasmModule.init_compression(data));
    const content_type = compression.data.content_type();
    logMs(compression, "initialized compression");

    const deflated = timeSync(() => compression.data.compress_cb(cb));
    const startKb = formatInt(data.length / 1024);
    const endKb = formatInt(deflated.data.length / 1024);
    logMs(deflated, `compressed: ${startKb}kB to ${endKb}kB`);

    return transfer(
      {
        contentType: content_type,
        // we know that wasm-bindgen does not return shared array buffers.
        data: deflated.data as Uint8Array<ArrayBuffer>,
      },
      [deflated.data.buffer],
    );
  },

  transform(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    // wasm-bindgen ensures that the returned Uint8Array is not a SharedArrayBuffer
    const out = wasmModule.download_transformation(
      data,
    ) as Uint8Array<ArrayBuffer>;
    return transfer(out, [out.buffer]);
  },
};

expose(obj);
