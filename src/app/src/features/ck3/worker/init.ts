import { wasm } from "./common";

export const initializeWasm = wasm.initializeModule;
export async function fetchData(file: File) {
  const data = await file.arrayBuffer().then((x) => new Uint8Array(x));
  wasm.stash(data, { kind: "file", file });
}

export async function parseCk3() {
  wasm.save = wasm.module.parse_save(wasm.takeStash());
  const meta = wasm.save.metadata();
  return { meta };
}
