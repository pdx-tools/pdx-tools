import { createWasmGame } from "@/lib/wasm";
import wasmPath from "@/wasm/wasm_imperator_bg.wasm?url";
import * as mod from "@/wasm/wasm_imperator";
import tokenPath from "../../../../../../assets/tokens/imperator.bin?url";

export const wasm = createWasmGame<typeof mod, mod.SaveFile, typeof wasmPath>(
  mod,
  wasmPath,
  tokenPath,
);
