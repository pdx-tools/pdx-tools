import { expose, transfer } from "comlink";
import init, * as wasmModule from "../../wasm/wasm_compress";
import wasmPath from "../../wasm/wasm_compress_bg.wasm?url";
import { timeSync } from "@/lib/timeit";
import { formatInt } from "@/lib/format";

export type ProgressCb = (portion: number) => void;

export const obj = {
  async loadWasm() {
    await init(wasmPath);
  },

  compress(data: Uint8Array<ArrayBuffer>, cb: ProgressCb) {
    const compression = timeSync("initialized compression", () =>
      wasmModule.init_compression(data),
    );
    const content_type = compression.content_type();

    const startKb = formatInt(data.length / 1024);
    const deflated = timeSync(
      (result) => {
        const endKb = formatInt(result.length / 1024);
        return `compressed: ${startKb}kB to ${endKb}kB`;
      },
      () => compression.compress_cb(cb),
    );

    return transfer(
      {
        contentType: content_type,
        // we know that wasm-bindgen does not return shared array buffers.
        data: deflated as Uint8Array<ArrayBuffer>,
      },
      [deflated.buffer],
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
