import init, * as wasmModule from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import wasmPath from "../../../../../../wasm-eu4/pkg/wasm_eu4_bg.wasm";
import { getDataUrls } from "@/lib/urls";
import {
  Achievements,
  EnhancedMeta,
  GameplayOptions,
  Meta,
} from "../../../eu4/types/models";
import { eu4SetMeta, eu4SetSaveFile } from "./common";
import { timeit } from "../worker-lib";
import { AnalyzeOptions } from "../worker-types";

let wasmInitialized: Promise<void> | undefined = undefined;

async function loadWasm() {
  const wasmInit = init(wasmPath);
  const tokenLocation = require("../../../../../../../assets/tokens/eu4.bin");
  const tokenResp = await fetch(tokenLocation);
  const tokenData = await tokenResp.arrayBuffer();
  await wasmInit;
  wasmModule.set_tokens(new Uint8Array(tokenData));
}

async function initializeWasm() {
  if (wasmInitialized === undefined) {
    wasmInitialized = loadWasm();
  }

  await wasmInitialized;
}

const startPercent = 14;
export async function initializeEu4(
  data: Uint8Array,
  options?: AnalyzeOptions
) {
  var [_, elapsedMs] = await timeit(initializeWasm);

  options?.progress({
    kind: "progress",
    msg: "initialized eu4 parser module",
    percent: startPercent + 6,
    elapsedMs,
  });

  let progress = startPercent + 6;
  const saveParsePercent = 60;

  options?.progress({
    kind: "start poll",
    percent: progress,
    endPercent: saveParsePercent,
    elapsedMs: 0,
  });

  try {
    var [save, elapsedMs] = await timeit(() => wasmModule.parse_save(data));
  } finally {
    options?.progress({
      kind: "end poll",
      percent: saveParsePercent,
      elapsedMs: 0,
    });
  }

  options?.progress({
    kind: "progress",
    msg: "save parsed",
    percent: saveParsePercent,
    elapsedMs,
  });

  const version = save.get_version();

  const dataUrl = getDataUrls(version).data;
  var [gameData, elapsedMs] = await timeit(async () => {
    const resp = await fetch(dataUrl);
    return await resp.arrayBuffer();
  });

  options?.progress({
    kind: "progress",
    msg: `game data fetched for ${version}`,
    percent: saveParsePercent + 5,
    elapsedMs,
  });

  var [savefile, elapsedMs] = await timeit(() =>
    wasmModule.game_save(save, new Uint8Array(gameData))
  );

  options?.progress({
    kind: "progress",
    msg: "joined save and game data",
    percent: saveParsePercent + 10,
    elapsedMs,
  });

  var [meta, elapsedMs] = await timeit(() => getMeta(savefile));

  eu4SetSaveFile(savefile);
  eu4SetMeta(meta);

  var [achievements, elapsedMs] = await timeit(
    () => savefile.get_achievements() as Achievements
  );

  return { meta, achievements };
}

function getMeta(savefile: wasmModule.SaveFile): EnhancedMeta {
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
