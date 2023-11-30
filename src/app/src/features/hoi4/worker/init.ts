import { wasm } from "./common";
import { Hoi4Metadata } from "./types";

export const initializeWasm = wasm.initializeModule;
export async function fetchData(file: File) {
  const data = await file.arrayBuffer().then((x) => new Uint8Array(x));
  wasm.stash(data, { kind: "file", file });
}

export async function parseHoi4() {
  wasm.save = wasm.module.parse_save(wasm.takeStash());
  const meta: Hoi4Metadata = wasm.save.metadata();
  return { meta };
}

export async function countryDetails(tag: string) {
  return wasm.save.country_details(tag);
}
