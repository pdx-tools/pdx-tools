import init, * as wasmModule from "../../../../../../wasm-ck3/pkg/wasm_ck3";
import wasmPath from "../../../../../../wasm-ck3/pkg/wasm_ck3_bg.wasm";
import { setSaveFile } from "./common";
import { ck3Metadata } from "./module";
import { timeit } from "../worker-lib";
import { AnalyzeOptions } from "../worker-types";

let wasmInitialized: Promise<void> | undefined = undefined;

async function loadWasm() {
  const wasmInit = init(wasmPath);
  const tokenLocation = require("../../../../../../../assets/tokens/ck3.bin");
  const tokenResp = await fetch(tokenLocation);
  const tokenData = await tokenResp.arrayBuffer();
  await wasmInit;
  wasmModule.set_tokens(new Uint8Array(tokenData));
}

async function initializeWasm() {
  if (wasmInitialized === undefined) {
    wasmInitialized = loadWasm();
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
