import { createWasmGame } from "@/lib/wasm";
import wasmPath from "../../../../../wasm-ck3/pkg/wasm_ck3_bg.wasm?url";
import * as mod from "../../../../../wasm-ck3/pkg/wasm_ck3";
import tokenPath from "../../../../../../assets/tokens/ck3.bin?url";

export const wasm = createWasmGame<typeof mod, mod.SaveFile, typeof wasmPath>(
  mod,
  wasmPath,
  tokenPath,
);
