import init, * as wasmModule from "../../../../../../wasm-imperator/pkg/wasm_imperator";
import wasmPath from "../../../../../../wasm-imperator/pkg/wasm_imperator_bg.wasm";
import { setSaveFile } from "./common";
import { imperatorMetadata } from "./module";
import { timeit } from "../worker-lib";
import { AnalyzeOptions } from "../worker-types";

let wasmInitialized: Promise<wasmModule.InitOutput> | undefined = undefined;

async function initializeWasm() {
  if (wasmInitialized === undefined) {
    wasmInitialized = init(wasmPath);
  }
  await wasmInitialized;
}

export async function initializeImperator(
  data: Uint8Array,
  options?: AnalyzeOptions
) {
  var [_, elapsedMs] = await timeit(initializeWasm);

  options?.progress({
    kind: "progress",
    msg: "initialized imperator parser module",
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

  const meta = imperatorMetadata();
  return { meta };
}
