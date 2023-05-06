import { expose, transfer } from "comlink";
import init, * as wasmModule from "../../../../wasm-compress/pkg/wasm_compress";
import wasmPath from "../../../../wasm-compress/pkg/wasm_compress_bg.wasm";
import { CompressionPayload } from "./compress-types";
import { timeSync } from "@/lib/timeit";
import { formatInt } from "@/lib/format";
import { logMs } from "@/lib/log";

export type ProgressCb = (portion: number) => void;

const obj = {
  async loadWasm() {
    await init(wasmPath);
  },

  compress(data: Uint8Array, cb: ProgressCb): CompressionPayload {
    const deflated = timeSync(() => wasmModule.compress(data, cb));
    const startKb = formatInt(data.length / 1024);
    const endKb = formatInt(deflated.data.length / 1024);
    logMs(deflated, `compressed: ${startKb}kB to ${endKb}kB`);

    const meta = JSON.parse(wasmModule.recompressed_meta(data));
    return transfer(
      {
        contentType: meta.content_type,
        contentEncoding: meta.content_encoding,
        data: deflated.data,
      },
      [deflated.data.buffer]
    );
  },
};

expose(obj);

export type CompressionWorker = typeof obj;
