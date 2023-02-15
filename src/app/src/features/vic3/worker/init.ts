import { wasm } from "./common";
import { Vic3Metadata } from "./types";

export const initializeWasm = wasm.initializeModule;
export async function fetchData(file: File) {
  const data = await file.arrayBuffer().then((x) => new Uint8Array(x));
  wasm.stash(data, { kind: "local", file });
}

export async function parseVic3() {
  wasm.save = wasm.module.parse_save(wasm.takeStash());
  const meta: Vic3Metadata = wasm.save.metadata();
  return { meta };
}
