import type { Vic3SaveInput } from "../store";
import { transfer } from "comlink";
import { fetchOk } from "@/lib/fetch";
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

/** Fetch and load the game data that describes and colors the map */
export async function loadGameBundle(url: string) {
  const response = await fetchOk(url);
  const data = new Uint8Array(await response.arrayBuffer());
  wasm.save.load_game_bundle(data);
  return wasm.save.landed_countries().countries;
}

/** The location arrays of the political map, ready to send to the map worker */
export function locationArrays() {
  const data = wasm.save.location_arrays();
  return transfer(data, [data.buffer]);
}

/** Location flags with the provinces of `tag` highlighted */
export function locationFlags(tag: string | null) {
  const data = wasm.save.location_flags(tag);
  return transfer(data, [data.buffer]);
}

export function provinceDetails(provinceId: number) {
  return wasm.save.province_details(provinceId) ?? null;
}

export function capitalProvince(tag: string) {
  return wasm.save.capital_province(tag) ?? null;
}
