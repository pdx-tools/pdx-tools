import init, * as wasmModule from "../../../../../wasm-detect/pkg/wasm_detect";
import wasmPath from "../../../../../wasm-detect/pkg/wasm_detect_bg.wasm";
import { DetectedDataType } from "../engineSlice";
import { timeit } from "./worker-lib";
import { AnalyzeOptions } from "./worker-types";

let wasmInitialized: Promise<wasmModule.InitOutput> | undefined = undefined;

async function initializeWasm() {
  if (wasmInitialized === undefined) {
    wasmInitialized = init(wasmPath);
  }
  await wasmInitialized;
}

const narrowDetectedDataType = (numType: number): DetectedDataType => {
  switch (numType) {
    case 1:
      return "eu4";
    default:
      throw new Error("unrecognized data");
  }
};

export async function detectType(
  data: Uint8Array,
  options?: AnalyzeOptions
): Promise<DetectedDataType> {
  const startPercent = 10;

  var [_, elapsedMs] = await timeit(initializeWasm);

  options?.progress({
    kind: "progress",
    msg: "initialized data detection module",
    percent: startPercent + 2,
    elapsedMs,
  });

  var [numType, elapsedMs] = await timeit(() => wasmModule.detect_type(data));
  const dataType = narrowDetectedDataType(numType);
  options?.progress({
    kind: "detected",
    type: dataType,
    percent: startPercent + 4,
    elapsedMs,
  });

  return dataType;
}
