import { createWasmGame } from "@/lib/wasm";
import wasmPath from "../../../../../wasm-vic3/pkg/wasm_vic3_bg.wasm";
import * as mod from "../../../../../wasm-vic3/pkg/wasm_vic3";
import tokenPath from "../../../../../../assets/tokens/vic3.bin";

export const wasm = createWasmGame<typeof mod, mod.SaveFile, typeof wasmPath>(
  mod,
  wasmPath,
  tokenPath,
);
