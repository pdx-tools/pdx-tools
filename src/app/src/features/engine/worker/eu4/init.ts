import init, * as wasmModule from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import wasmPath from "../../../../../../wasm-eu4/pkg/wasm_eu4_bg.wasm";
import { Meta } from "../../../eu4/types/models";
import { timeit } from "../worker-lib";
import { AnalyzeOptions } from "../worker-types";
import { eu4SetSaveBytes } from "./common";

let wasmInitialized: Promise<void> | undefined = undefined;
async function loadWasm() {
  const wasmInit = init(wasmPath);
  const tokenLocation = require("../../../../../../../assets/tokens/eu4.bin");
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

const startPercent = 14;
export async function initializeEu4(
  data: Uint8Array,
  options?: AnalyzeOptions
) {
  var [_, elapsedMs] = await timeit(initializeWasm);

  options?.progress({
    kind: "progress",
    msg: "initialized eu4 parser module",
    percent: startPercent + 6,
    elapsedMs,
  });

  var [meta, elapsedMs] = await timeit<Meta>(() => wasmModule.parse_meta(data));

  const version = `${meta.savegame_version.first}.${meta.savegame_version.second}`;

  options?.progress({
    kind: "progress",
    msg: `meta extracted ${version}`,
    percent: startPercent + 16,
    elapsedMs,
  });

  eu4SetSaveBytes(data);
  return { meta, version };
}
