import path from "path";
import getConfig from "next/config";
import {
  WeightedScore,
  Achievement,
  SaveEncoding as ApiSaveEncoding,
  GameDifficulty as ApiGameDifficulty,
} from "@/services/appApi";
import { toDbDifficulty } from "./db";
import { GameDifficulty, SaveEncoding } from "./db";
const { dlopen } = require("process");
let nextRoot = getConfig()?.serverRuntimeConfig?.PROJECT_ROOT;
nextRoot = nextRoot && process.env.NODE_ENV === "production" ? "." : nextRoot;

// Much better to do this than to use a combination of
// __non_webpack_require__, node-loader, and webpack configuration
// to workaround webpack issues
var modulePath = nextRoot
  ? path.join(path.resolve(nextRoot), "src", "server-lib", "applib.node")
  : path.join(__dirname, "applib.node");

const nativeModule = { exports: {} as any };
dlopen(nativeModule, modulePath);

interface ParsedResult extends ParsedFile {
  kind: "Parsed";
}

interface InvalidPatchResult {
  kind: "InvalidPatch";
  patch_shorthand: string;
}

type ParseResult = InvalidPatchResult | ParsedResult;

interface SavePatch {
  first: number;
  second: number;
  third: number;
  fourth: number;
}

export interface ParsedFile {
  patch: SavePatch;
  encoding: SaveEncoding;
  campaign_id: string;
  campaign_length: number;
  is_ironman: boolean;
  is_multiplayer: boolean;
  is_observer: boolean;
  playthrough_id: string | null;
  game_difficulty: GameDifficulty;
  player_names: string[];
  player_tag: string;
  player_tag_name: string;
  player_start_tag: string | null;
  player_start_tag_name: string | null;
  date: string;
  days: number;
  score_date: string;
  score_days: number;
  achievements: number[] | null;
  dlc_ids: number[];
  checksum: string;
  patch_shorthand: string;
}

type ParsedFileNative = Omit<ParsedResult, "encoding" | "game_difficulty"> & {
  encoding: ApiSaveEncoding;
  game_difficulty: ApiGameDifficulty;
};

type ParseResultNative = InvalidPatchResult | ParsedFileNative;

function nativeParseToDb(x: ParseResultNative): ParseResult {
  if (x.kind == "Parsed") {
    return {
      ...x,
      game_difficulty: toDbDifficulty(x.game_difficulty),
    };
  } else {
    return x;
  }
}

export async function parseFile(path: string) {
  const result = await nativeModule.exports.parseFile(path);
  const js: ParseResultNative = JSON.parse(result);
  return nativeParseToDb(js);
}

export function fileChecksum(path: string): Promise<string> {
  return nativeModule.exports.fileChecksum(path);
}

// https://stackoverflow.com/a/59787784/433785
function isEmpty(obj: Record<number, Achievement>) {
  for (var i in obj) {
    return false;
  }
  return true;
}

let achievements_cached: Achievement[] = [];
export function loadAchievements(): Achievement[] {
  if (!isEmpty(achievements_cached)) {
    return achievements_cached;
  } else {
    const result = nativeModule.exports.achievements();
    return (achievements_cached = JSON.parse(result));
  }
}

export function getAchievement(id: number): Achievement | undefined {
  return loadAchievements().find((x) => x.id == id);
}

export function eu4DaysToDate(days: number): string {
  return nativeModule.exports.eu4DaysToDate(days);
}

export function validPatch(major: number, minor: number): boolean {
  return nativeModule.exports.validPatch(major, minor);
}

export function latestEu4MinorPatch(): number {
  return nativeModule.exports.latestEu4MinorPatch();
}
