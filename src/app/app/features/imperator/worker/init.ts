import { wasm } from "./common";
import { ImperatorMetadata } from "./types";

export const initializeWasm = wasm.initializeModule;
export async function fetchData(file: File) {
  const data = await file.arrayBuffer().then((x) => new Uint8Array(x));
  wasm.stash(data, { kind: "file", file });
}

export async function parseImperator() {
  wasm.save = wasm.module.parse_save(wasm.takeStash());
  const meta: ImperatorMetadata = wasm.save.metadata();
  return { meta };
}
