import { expose, transfer } from "comlink";
import init, * as wasmModule from "@pdx.tools/wasm-compress";
import wasmPath from "@pdx.tools/wasm-compress/wasm_compress_bg.wasm?url";
import { timeSync } from "@/lib/timeit";
import { formatInt } from "@/lib/format";
import { logMs } from "@/lib/log";

export type ProgressCb = (portion: number) => void;

export const obj = {
  async loadWasm() {
    await init(wasmPath);
  },

  compress(data: Uint8Array, cb: ProgressCb) {
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
        data: deflated.data,
      },
      [deflated.data.buffer],
    );
  },

  transform(data: Uint8Array): Uint8Array {
    const out = wasmModule.download_transformation(data);
    return transfer(out, [out.buffer]);
  },
};

expose(obj);
