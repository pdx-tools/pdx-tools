import { check } from "@/lib/isPresent";
import { log, logMs } from "@/lib/log";
import { timeit } from "@/lib/timeit";
import { transfer } from "comlink";
import {
  Achievements,
  EnhancedMeta,
  GameplayOptions,
  Meta,
} from "../types/models";
import { wasm } from "./common";
import * as mod from "../../../../../wasm-eu4/pkg/wasm_eu4";
import { fetchOk } from "@/lib/fetch";
import { type Eu4SaveInput } from "../store";

export const initializeWasm = wasm.initializeModule;
export async function fetchData(save: Eu4SaveInput) {
  switch (save.kind) {
    case "local": {
      const data = await save.file.arrayBuffer();
      wasm.stash(new Uint8Array(data), { kind: "local", file: save.file });
      return;
    }
    case "server": {
      const url = `/api/saves/${save.saveId}/file`;
      const data = await fetchOk(url).then((x) => x.arrayBuffer());
      wasm.stash(new Uint8Array(data), { kind: "remote", url });
      return;
    }
    case "skanderbeg": {
      // Unable to stream this as the skanderbeg saves as the content-length does
      // not actually match the body as the body is compressed twice and the
      // reported length is only the first compression
      const url = `https://skanderbeg.pm/api.php?scope=downloadSaveFile&id=${save.skanId}`;
      const data = await fetchOk(url).then((x) => x.arrayBuffer());
      wasm.stash(new Uint8Array(data), { kind: "remote", url });
      return;
    }
  }
}

let initialSave: mod.InitialSave | undefined;

function getInitialSave() {
  return check(initialSave, "initial save is undefined");
}

export async function eu4InitialParse(
  gameData: Uint8Array,
  provinceIdToColorIndex: Uint16Array
) {
  const parse = await timeit(() =>
    wasm.module.initial_save(wasm.takeStash(), gameData, provinceIdToColorIndex)
  );
  initialSave = parse.data;
}

export async function eu4InitialMapColors() {
  const result = getInitialSave().initial_primary_colors();
  return transfer(result, [result.buffer]);
}

export async function eu4GameParse() {
  const savefile = getInitialSave().full_parse();

  const meta = getMeta(savefile);
  wasm.save = savefile;
  const achievements = await timeit<Achievements>(() =>
    savefile.get_achievements()
  );
  logMs(achievements, "computing achievements");

  const defaultSelectedTag = eu4DefaultSelectedTag(meta);
  return { meta, achievements: achievements.data, defaultSelectedTag };
}

export async function parseMeta() {
  const meta = wasm.module.parse_meta(wasm.viewStash()) as Meta;
  const version = `${meta.savegame_version.first}.${meta.savegame_version.second}`;
  return { meta, version };
}

export function getMeta(savefile: mod.SaveFile): EnhancedMeta {
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

function eu4DefaultSelectedTag(meta: EnhancedMeta): string {
  if (meta === undefined) {
    throw new Error("meta can't be undefined");
  }

  if (meta.player && meta.player !== "---") {
    return meta.player;
  }

  if (Object.keys(meta.players).length > 0) {
    return Object.keys(meta.players)[0];
  }

  if (meta.aliveCountries.length > 0) {
    return meta.aliveCountries[0];
  }

  throw new Error("unable to determine default selected country");
}
