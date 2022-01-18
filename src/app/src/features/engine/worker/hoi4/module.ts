import { transfer } from "comlink";
import { getRawData } from "../storage";
import * as wasmModule from "../../../../../../wasm-hoi4/pkg/wasm_hoi4";
import { loadedSave } from "./common";
import { Hoi4Metadata } from "./types";

export function hoi4Metadata(): Hoi4Metadata {
  return loadedSave().metadata();
}

export async function hoi4Melt() {
  const data = await getRawData();
  const melt = wasmModule.melt(data);
  return transfer(melt, [melt.buffer]);
}
