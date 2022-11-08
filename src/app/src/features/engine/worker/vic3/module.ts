import { transfer } from "comlink";
import { getRawData } from "../storage";
import * as wasmModule from "../../../../../../wasm-vic3/pkg/wasm_vic3";
import { loadedSave } from "./common";
import { Vic3Metadata } from "./types";

export function vic3Metadata(): Vic3Metadata {
  return loadedSave().metadata();
}

export async function vic3Melt() {
  const data = await getRawData();
  const melt = wasmModule.melt(data);
  return transfer(melt, [melt.buffer]);
}
