import { wasm } from "./common";
import { Vic3Metadata, Vic3Stats } from "./types";

export const initializeWasm = wasm.initializeModule;
export async function fetchData(file: File) {
  const data = await file.arrayBuffer().then((x) => new Uint8Array(x));
  wasm.stash(data, { kind: "file", file });
}

export async function parseVic3() {
  wasm.save = wasm.module.parse_save(wasm.takeStash());
  const meta: Vic3Metadata = wasm.save.metadata();
  const played_tag: string = wasm.save.get_played_tag();
  const tags: [string] = wasm.save.get_available_tags();
  return { meta, tags, played_tag };
}

export async function get_country_stats(tag: string) {
  const stats: [Vic3Stats] = wasm.save.get_country_stats(tag);
  return stats;
}
