import { expose, transfer } from "comlink";
import init, * as wasmModule from "../../../../wasm-br/pkg/wasm_br";
import wasmPath from "../../../../wasm-br/pkg/wasm_br_bg.wasm";
import { CompressionPayload } from "./brotli-types";
import { timeSync } from "@/lib/timeit";
import { formatInt } from "@/lib/format";
import { logMs } from "@/lib/log";

export type BrotliProgressCb = (portion: number) => void;

const obj = {
  async loadWasm() {
    await init(wasmPath);
  },

  compress(data: Uint8Array, cb: BrotliProgressCb): CompressionPayload {
    const deflated = timeSync(() => wasmModule.brotli_compress(data, cb));
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

export type BrotliWorker = typeof obj;
