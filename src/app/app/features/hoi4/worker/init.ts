import { wasm } from "./common";
import type { Hoi4Metadata, MapMatch, MapMode } from "./types";
import { fetchOk } from "@/lib/fetch";
import { transfer } from "comlink";

export const initializeWasm = wasm.initializeModule;
export async function parseHoi4(file: File) {
  wasm.setSource({ kind: "file", file });
  wasm.save = wasm.module.parse_save(file);
  const meta: Hoi4Metadata = wasm.save.metadata();
  return { meta };
}

export async function countryDetails(tag: string) {
  return wasm.save.country_details(tag);
}

/** Fetch and load the game data that describes and colors the map */
export async function loadGameBundle(url: string) {
  const response = await fetchOk(url);
  const data = new Uint8Array(await response.arrayBuffer());
  wasm.save.load_game_bundle(data);
  return wasm.save.landed_countries().countries;
}

/** Describe the save without game data, when no asset bundle matches it */
export function loadWithoutGameBundle() {
  wasm.save.load_without_game_bundle();
}

/** The countries, factions, occupations, wars, and events of the save */
export function overview() {
  return wasm.save.overview();
}

/** The location arrays of a map mode, ready to send to the map worker */
export function locationArrays(mode: MapMode) {
  const data = wasm.save.location_arrays(mode);
  return transfer(data, [data.buffer]);
}

/** Location flags with the land outside `focus` dimmed and `hover` lit */
export function matchFlags(focus: MapMatch, hover: MapMatch) {
  const data = wasm.save.match_flags(focus, hover);
  return transfer(data, [data.buffer]);
}

export function provinceDetails(provinceId: number) {
  return wasm.save.province_details(provinceId) ?? null;
}

export function capitalProvince(tag: string) {
  return wasm.save.capital_province(tag) ?? null;
}
