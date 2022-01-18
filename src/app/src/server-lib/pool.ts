import path from "path";
import getConfig from "next/config";
import { GameDifficulty, SaveEncoding } from "@prisma/client";
import {
  WeightedScore,
  Achievement,
  SaveEncoding as ApiSaveEncoding,
  GameDifficulty as ApiGameDifficulty,
} from "@/services/rakalyApi";
const { dlopen } = require("process");
let nextRoot = getConfig()?.serverRuntimeConfig?.PROJECT_ROOT;
nextRoot = nextRoot && process.env.NODE_ENV === "production" ? "." : nextRoot;

// Much better to do this than to use a combination of
// __non_webpack_require__, node-loader, and webpack configuration
// to workaround webpack issues
var modulePath = nextRoot
  ? path.join(path.resolve(nextRoot), "src", "server-lib", "libeu4gamejs.node")
  : path.join(__dirname, "libeu4gamejs.node");

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
  achievements: number[] | null;
  dlc_ids: number[];
  checksum: string;
  patch_shorthand: string;
  weighted_score: number;
}

type ParsedFileNative = Omit<ParsedResult, "encoding" | "game_difficulty"> & {
  encoding: ApiSaveEncoding;
  game_difficulty: ApiGameDifficulty;
};

type ParseResultNative = InvalidPatchResult | ParsedFileNative;

function apiEncodingToDb(x: ApiSaveEncoding): SaveEncoding {
  switch (x) {
    case "binzip":
      return SaveEncoding.BINZIP;
    case "text":
      return SaveEncoding.TEXT;
    case "textzip":
      return SaveEncoding.TEXTZIP;
  }
}

function apiDifficultyToDb(x: ApiGameDifficulty): GameDifficulty {
  switch (x) {
    case "VeryEasy":
      return GameDifficulty.VERY_EASY;
    case "Easy":
      return GameDifficulty.EASY;
    case "Normal":
      return GameDifficulty.NORMAL;
    case "Hard":
      return GameDifficulty.HARD;
    case "VeryHard":
      return GameDifficulty.VERY_HARD;
  }
}

function nativeParseToDb(x: ParseResultNative): ParseResult {
  if (x.kind == "Parsed") {
    return {
      ...x,
      encoding: apiEncodingToDb(x.encoding),
      game_difficulty: apiDifficultyToDb(x.game_difficulty),
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

export function calcWeightedScore(
  major: number,
  minor: number,
  days: number
): WeightedScore {
  const result = nativeModule.exports.weightedScore(major, minor, days);
  return JSON.parse(result);
}

export function weightedFactor(major: number, minor: number): number | null {
  return nativeModule.exports.weightedFactor(major, minor);
}

export function validPatch(major: number, minor: number): boolean {
  return nativeModule.exports.validPatch(major, minor);
}
