import { createWasmGame } from "@/lib/wasm";
import wasmPath from "@pdx.tools/wasm-vic3/wasm_vic3_bg.wasm?url";
import * as mod from "@pdx.tools/wasm-vic3";
import tokenPath from "../../../../../../assets/tokens/vic3.bin?url";

export const wasm = createWasmGame<typeof mod, mod.SaveFile, typeof wasmPath>(
  mod,
  wasmPath,
  tokenPath,
);
