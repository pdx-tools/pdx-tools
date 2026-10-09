import { wasm } from "./common";
import type { Hoi4Metadata } from "./types";
import { fetchOk } from "@/lib/fetch";
import { transfer } from "comlink";

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
