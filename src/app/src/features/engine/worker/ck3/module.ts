import { transfer } from "comlink";
import { getRawData } from "../storage";
import * as wasmModule from "../../../../../../wasm-ck3/pkg/wasm_ck3";
import { loadedSave } from "./common";
import { Ck3Metadata } from "./types";

export function ck3Metadata(): Ck3Metadata {
  return loadedSave().metadata();
}

export async function ck3Melt() {
  const data = await getRawData();
  const melt = wasmModule.melt(data);
  return transfer(melt, [melt.buffer]);
}
