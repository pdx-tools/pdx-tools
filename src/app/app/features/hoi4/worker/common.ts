import { createWasmGame } from "@/lib/wasm";
import wasmPath from "@pdx.tools/wasm-hoi4/wasm_hoi4_bg.wasm?url";
import * as mod from "@pdx.tools/wasm-hoi4";
import tokenPath from "../../../../../../assets/tokens/hoi4.bin?url";

export const wasm = createWasmGame<typeof mod, mod.SaveFile, typeof wasmPath>(
  mod,
  wasmPath,
  tokenPath,
);
