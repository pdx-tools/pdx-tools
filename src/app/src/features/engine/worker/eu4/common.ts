import {
  EnhancedMeta,
  GameplayOptions,
  Meta,
} from "@/features/eu4/types/models";
import * as wasmModule from "../../../../../../wasm-eu4/pkg/wasm_eu4";

let savefile: wasmModule.SaveFile | undefined = undefined;
let meta: EnhancedMeta | undefined = undefined;
let saveBytes = new Uint8Array();

export function loadedSave() {
  if (savefile === undefined) {
    throw new Error("savefile should not undefined");
  } else {
    return savefile;
  }
}

export function eu4GetSaveFile() {
  return savefile;
}

export function eu4SetSaveFile(aSavefile: wasmModule.SaveFile) {
  savefile?.free();
  savefile = aSavefile;
}

export function eu4SetMeta(aMeta: EnhancedMeta) {
  meta = aMeta;
}

export function eu4GetMeta() {
  return meta;
}

export function eu4SetSaveBytes(data: Uint8Array) {
  saveBytes = data;
}

export function eu4TakeSaveBytes() {
  const result = saveBytes;
  saveBytes = new Uint8Array();
  return result;
}

export function getMeta(savefile: wasmModule.SaveFile): EnhancedMeta {
  const meta = savefile.get_meta_raw() as Meta;
  const starting_tag = savefile.get_starting_country();
  const starting_tag_name =
    starting_tag !== null ? savefile.localize_country(starting_tag) : null;

  const start_date = savefile.get_start_date() as string;
  const total_days = savefile.get_total_days();
  const player_tag_name = savefile.localize_country(meta.player);
  const dlc = savefile.get_dlc_ids();
  const encoding = savefile.save_encoding();
  const players = savefile.get_players() as Record<string, string>;
  const aliveCountries = savefile.get_alive_countries() as string[];
  const playthroughId = savefile.playthrough_id();
  const mode = savefile.save_mode();
  const gameplayOptions = savefile.gameplay_options() as GameplayOptions;
  const warnings = savefile.savefile_warnings() as string[];

  return {
    start_date,
    total_days,
    starting_tag,
    starting_tag_name,
    player_tag_name,
    dlc,
    encoding,
    players,
    aliveCountries,
    playthroughId,
    mode,
    gameplayOptions,
    warnings,
    ...meta,
  };
}
