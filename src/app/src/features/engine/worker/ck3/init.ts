import init, * as wasmModule from "../../../../../../wasm-ck3/pkg/wasm_ck3";
import wasmPath from "../../../../../../wasm-ck3/pkg/wasm_ck3_bg.wasm";
import { setSaveFile } from "./common";
import { ck3Metadata } from "./module";
import { timeit } from "../worker-lib";
import { AnalyzeOptions } from "../worker-types";

let wasmInitialized: Promise<wasmModule.InitOutput> | undefined = undefined;

async function initializeWasm() {
  if (wasmInitialized === undefined) {
    wasmInitialized = init(wasmPath);
  }
  await wasmInitialized;
}

export async function initializeCk3(
  data: Uint8Array,
  options?: AnalyzeOptions
) {
  var [_, elapsedMs] = await timeit(initializeWasm);

  options?.progress({
    kind: "progress",
    msg: "initialized ck3 parser module",
    percent: 20,
    elapsedMs,
  });

  options?.progress({
    kind: "start poll",
    percent: 20,
    endPercent: 90,
    elapsedMs: 0,
  });

  try {
    var [save, elapsedMs] = await timeit(() => wasmModule.parse_save(data));
  } finally {
    options?.progress({
      kind: "end poll",
      percent: 90,
      elapsedMs: 0,
    });
  }

  options?.progress({
    kind: "progress",
    msg: "save parsed",
    percent: 90,
    elapsedMs,
  });

  setSaveFile(save);

  const meta = ck3Metadata();
  return { meta };
}
