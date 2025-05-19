import { createWasmGame } from "@/lib/wasm";
import wasmPath from "@pdx.tools/wasm-imperator/wasm_imperator_bg.wasm?url";
import * as mod from "@pdx.tools/wasm-imperator";
import tokenPath from "../../../../../../assets/tokens/imperator.bin?url";

export const wasm = createWasmGame<typeof mod, mod.SaveFile, typeof wasmPath>(
  mod,
  wasmPath,
  tokenPath,
);
