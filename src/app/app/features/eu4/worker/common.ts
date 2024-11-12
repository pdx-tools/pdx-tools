import wasmPath from "../../../../../wasm-eu4/pkg/wasm_eu4_bg.wasm?url";
import * as mod from "../../../../../wasm-eu4/pkg/wasm_eu4";
import tokenPath from "../../../../../../assets/tokens/eu4.bin?url";
import { createWasmGame } from "@/lib/wasm";

export const Eu4WasmModule = mod;
export const wasm = createWasmGame<typeof mod, mod.SaveFile, typeof wasmPath>(
  mod,
  wasmPath,
  tokenPath,
);
