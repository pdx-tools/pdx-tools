import { expose, transfer } from "comlink";
import init, * as wasmModule from "../../../../wasm-br/pkg/wasm_br";
//@ts-ignore
import wasmPath from "../../../../wasm-br/pkg/wasm_br_bg.wasm";
import { debugLog } from "@/lib/debug";
import { CompressionPayload } from "./brotli-types";

export type BrotliProgressCb = (portion: number) => void;

const obj = {
  async loadWasm() {
    await init(wasmPath);
  },

  compress(data: Uint8Array, cb: BrotliProgressCb): CompressionPayload {
    const start = performance.now();
    const startKb = (data.length / 1024).toFixed(0);
    const result = wasmModule.brotli_compress(data, cb);
    const end = performance.now();
    const endKb = (result.length / 1024).toFixed(0);
    debugLog(
      `compressed: ${startKb}KB to ${endKb}KB in ${(end - start).toFixed(2)}ms`
    );

    const meta = JSON.parse(wasmModule.recompressed_meta(data));
    return transfer(
      {
        contentType: meta.content_type,
        contentEncoding: meta.content_encoding,
        data: result,
      },
      [result.buffer]
    );
  },
};

expose(obj);

export type BrotliWorker = typeof obj;
