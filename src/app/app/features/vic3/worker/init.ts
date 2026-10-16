import type { Vic3SaveInput } from "../store";
import { transfer } from "comlink";
import { fetchOk } from "@/lib/fetch";
import { wasm } from "./common";

export const initializeWasm = wasm.initializeModule;
export async function parseVic3(save: Vic3SaveInput) {
  let file: File;
  switch (save.kind) {
    case "handle": {
      file = await save.file.getFile();
      wasm.setSource({ kind: "handle", file: save.file, lastModified: file.lastModified });
      break;
    }
    case "file": {
      file = save.file;
      wasm.setSource({ kind: "file", file });
      break;
    }
  }

  wasm.save = await wasm.module.parse_save(file);
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
