import { Vic3SaveInput } from "../store";
import { wasm } from "./common";

export const initializeWasm = wasm.initializeModule;
export async function fetchData(save: Vic3SaveInput) {
  switch (save.kind) {
    case "handle": {
      const file = await save.file.getFile();
      const lastModified = file.lastModified;
      const data = await file.arrayBuffer();
      wasm.stash(new Uint8Array(data), {
        kind: "handle",
        file: save.file,
        lastModified,
      });
      return;
    }
    case "file": {
      const data = await save.file.arrayBuffer();
      wasm.stash(new Uint8Array(data), { kind: "file", file: save.file });
      return;
    }
  }
}

export function parseVic3() {
  wasm.save = wasm.module.parse_save(wasm.takeStash());
  return wasm.save.metadata();
}

export function get_countries_stats() {
  return wasm.save.get_countries_stats();
}

export function get_country_stats(tag: string) {
  return wasm.save.get_country_stats(tag);
}

export function get_country_goods_prices(tag: string) {
  return wasm.save.get_country_goods_prices(tag);
}
