import { fileVersion, toPlaythroughId } from "@/features/campaign/types";
import type { FileVersion, PlaythroughId } from "@/features/campaign/types";
import { timeSync } from "@/lib/timeit";
import type { AchievementsScore } from "../types/models";
import { wasm } from "./common";
import type * as mod from "@/wasm/wasm_eu4";
import { fetchOk } from "@/lib/fetch";
import type { Eu4SaveInput } from "../store";
import { resetTimelineCursor } from "./timeline";
import { transfer } from "comlink";
import { captureException } from "@/lib/captureException";
import type { Eu4Snapshot } from "../analysis/analysisTypes";

export const initializeWasm = wasm.initializeModule;
export async function fetchData(save: Eu4SaveInput) {
  switch (save.kind) {
    case "handle": {
      const file = await save.file.getFile();
      const data = await file.arrayBuffer();
      wasm.stash(new Uint8Array(data), { kind: "handle", file: save.file });
      return fileVersion(file);
    }
    case "file": {
      const data = await save.file.arrayBuffer();
      wasm.stash(new Uint8Array(data), { kind: "file", file: save.file });
      return fileVersion(save.file);
    }
    case "server": {
      const url = `/api/saves/${save.saveId}/file`;
      const data = await fetchOk(url).then((x) => x.arrayBuffer());
      wasm.stash(new Uint8Array(data), { kind: "remote", url });
      return null;
    }
  }
}

export function eu4GameParse(gameData: Uint8Array, provinceIdToColorIndex: Uint16Array) {
  const data = wasm.takeStash();
  wasm.save = wasm.module.parse_save(data, gameData, provinceIdToColorIndex);
  const meta = getMeta(wasm.save);
  const achievements = wasm.save.get_achievements();
  const defaultSelectedTag = eu4DefaultSelectedTag(meta);
  return { meta, achievements, defaultSelectedTag };
}

export function parseMeta() {
  const meta = wasm.module.parse_meta(wasm.viewStash());
  const version = `${meta.savegame_version.first}.${meta.savegame_version.second}`;
  return { meta, version };
}

export type EnhancedMeta = ReturnType<typeof getMeta>;
export function getMeta(savefile: mod.SaveFile) {
  const meta = savefile.get_meta_raw();
  const starting_tag = savefile.get_starting_country() ?? null;
  const starting_tag_name = starting_tag ? savefile.localize_country(starting_tag) : null;

  const start_date = savefile.get_start_date();
  const total_days = savefile.get_total_days();
  const player_tag_name = savefile.localize_country(meta.player);
  const players = savefile.get_players();
  const aliveCountries = savefile.get_alive_countries();
  const warnings = savefile.savefile_warnings();

  const saveInfo = savefile.save_info();

  return {
    start_date,
    total_days,
    starting_tag,
    starting_tag_name,
    player_tag_name,
    players,
    aliveCountries,
    warnings,
    ...saveInfo,
    ...meta,
    playthroughId: toPlaythroughId(saveInfo.playthroughId),
    multiplayer: saveInfo.mode === "Multiplayer",
  };
}

function eu4DefaultSelectedTag(meta: EnhancedMeta): string {
  if (meta === undefined) {
    throw new Error("meta can't be undefined");
  }

  if (meta.player && meta.player !== "---") {
    return meta.player;
  }

  const players = Object.keys(meta.players);
  if (players[0]) {
    return players[0];
  }

  if (meta.aliveCountries[0]) {
    return meta.aliveCountries[0];
  }

  throw new Error("unable to determine default selected country");
}

/**
 * Replace the open save with a new write of its file. A write of another
 * campaign, or a save that another file replaced meanwhile, is not read.
 * The campaign analysis snapshot comes from the same parse when asked for.
 */
export async function eu4Reparse(
  handle: FileSystemFileHandle,
  file: File,
  playthroughId: PlaythroughId,
  withSnapshot: boolean,
): Promise<
  | {
      kind: "updated";
      meta: EnhancedMeta;
      achievements: AchievementsScore;
      fileVersion: FileVersion;
      snapshot: Eu4Snapshot | null;
    }
  | { kind: "otherCampaign" | "replaced" }
> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (!(await wasm.holdsHandle(handle))) return { kind: "replaced" };
  const reparse = timeSync("reparsed save", () => wasm.save.reparse(playthroughId, data));
  if (reparse.kind === "otherCampaign") return reparse;

  // The old cursor points into the save that was just replaced.
  resetTimelineCursor();
  // The save is replaced already, so a failed snapshot must not fail the update.
  let snapshot: Eu4Snapshot | null = null;
  try {
    if (withSnapshot) snapshot = wasm.save.analysis_snapshot();
  } catch (error) {
    captureException(error, { tags: { msg: "file-watcher" } });
  }
  const result = {
    kind: "updated" as const,
    meta: getMeta(wasm.save),
    achievements: wasm.save.get_achievements(),
    fileVersion: fileVersion(file),
    snapshot,
  };
  return snapshot ? transfer(result, [snapshot.data.buffer]) : result;
}
