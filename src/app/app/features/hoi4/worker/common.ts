import { createWasmGame } from "@/lib/wasm";
import wasmPath from "../../../../../wasm-hoi4/pkg/wasm_hoi4_bg.wasm?url";
import * as mod from "../../../../../wasm-hoi4/pkg/wasm_hoi4";
import tokenPath from "../../../../../../assets/tokens/hoi4.bin?url";

export const wasm = createWasmGame<typeof mod, mod.SaveFile, typeof wasmPath>(
  mod,
  wasmPath,
  tokenPath,
);
