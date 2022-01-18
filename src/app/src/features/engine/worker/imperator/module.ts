import { transfer } from "comlink";
import { getRawData } from "../storage";
import * as wasmModule from "../../../../../../wasm-imperator/pkg/wasm_imperator";
import { loadedSave } from "./common";
import { ImperatorMetadata } from "./types";

export function imperatorMetadata(): ImperatorMetadata {
  return loadedSave().metadata();
}

export async function imperatorMelt() {
  const data = await getRawData();
  const melt = wasmModule.melt(data);
  return transfer(melt, [melt.buffer]);
}
