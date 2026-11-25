import { fileVersion, toPlaythroughId } from "@/features/campaign/types";
import type { FileVersion, LocalSaveRef } from "@/features/campaign/types";
import { sha256 } from "@/lib/sha256";
import { timeSync } from "@/lib/timeit";
import type { AchievementsScore } from "../types/models";
import { wasm } from "./common";
import type * as mod from "@/wasm/wasm_eu4";
import { fetchOk } from "@/lib/fetch";
import type { Eu4SaveInput } from "../store";
import { resetTimelineCursor } from "./timeline";

export const initializeWasm = wasm.initializeModule;
/** Changes when the worker gets another save, so that a late call has no effect. */
let generation = 0;

export type ParsedSource = {
  fileVersion: FileVersion | null;
  /** The SHA-256 of the bytes. */
  hash: string | null;
  generation: number;
};

/** A page that is not secure has no hashes, and no kept saves. */
const hashOf = async (data: Uint8Array<ArrayBuffer>) =>
  isSecureContext ? await sha256(data) : null;

async function readRef(ref: LocalSaveRef) {
  const file = ref.kind === "handle" ? await ref.file.getFile() : ref.file;
  const data = new Uint8Array(await file.arrayBuffer());
  return { file, data, hash: await hashOf(data) };
}

async function readInput(save: Eu4SaveInput) {
  if (save.kind !== "server") {
    const { file, ...read } = await readRef(save);
    return { ...read, origin: save, version: fileVersion(file) };
  }
  const url = `/api/saves/${save.saveId}/file`;
  const data = new Uint8Array(await (await fetchOk(url)).arrayBuffer());
  return {
    data,
    hash: await hashOf(data),
    origin: { kind: "remote", url } as const,
    version: null,
  };
}

let lastFetch = 0;

export async function fetchData(save: Eu4SaveInput): Promise<ParsedSource> {
  const fetch = ++lastFetch;
  const { data, hash, origin, version } = await readInput(save);
  // A load that a newer one replaced can end its read last.
  if (fetch !== lastFetch) throw new DOMException("Another save was opened", "AbortError");
  wasm.stash(data, origin, hash);
  generation += 1;
  return { fileVersion: version, hash, generation };
}

/** The open save that a call is about. */
export type OpenSource = Pick<ParsedSource, "hash" | "generation">;

const isOpen = (open: OpenSource) => open.generation === generation && open.hash === wasm.hash;

/** Read the open save from a copy from now on, when the copy has the parsed bytes. */
export async function rebind(open: OpenSource, ref: LocalSaveRef): Promise<boolean> {
  const { hash } = await readRef(ref);
  if (hash !== open.hash || !isOpen(open)) return false;
  wasm.restash(ref, hash);
  return true;
}

export type LiveUpdate =
  | ({ kind: "updated"; meta: EnhancedMeta; achievements: AchievementsScore } & ParsedSource)
  /** The save needs other game data, so it must be opened. */
  | { kind: "other-version" }
  /** Another save was opened, or the file is not the expected one. */
  | { kind: "stale" };

/** Parse a later save of the campaign over the open one. A failure leaves the open save. */
export async function reparse(
  open: OpenSource,
  ref: LocalSaveRef,
  expected: string,
): Promise<LiveUpdate> {
  const { file, data, hash } = await readRef(ref);
  if (hash !== expected || !isOpen(open)) return { kind: "stale" };
  const { first, second } = wasm.save.get_meta_raw().savegame_version;
  const next = wasm.module.parse_meta(data).savegame_version;
  if (next.first !== first || next.second !== second) return { kind: "other-version" };

  timeSync("reparsed save", () => wasm.save.reparse(data));
  // The old cursor points into the save that was just replaced.
  resetTimelineCursor();
  wasm.restash(ref, hash);
  generation += 1;
  return {
    kind: "updated",
    meta: getMeta(wasm.save),
    achievements: wasm.save.get_achievements(),
    fileVersion: fileVersion(file),
    hash,
    generation,
  };
}

function checkOpen(open: OpenSource): void {
  if (!isOpen(open)) throw new Error("Another save was opened. Try again when it shows.");
}

/** The bytes of the save that the caller shows. */
export async function getRawData(open: OpenSource) {
  checkOpen(open);
  return wasm.viewData();
}

export async function melt(open: OpenSource) {
  checkOpen(open);
  return wasm.melt();
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
