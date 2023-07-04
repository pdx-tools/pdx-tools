import crypto from "crypto";
import dayjs from "dayjs";
import { eu4DaysToDate } from "../game";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Save, User, saves, users } from "./schema";
import { ParsedFile } from "../save-parser";
export {
  type User,
  type Save,
  type SaveEncoding,
  type GameDifficulty,
  type NewSave,
} from "./schema";

export type SaveFile = ReturnType<typeof toApiSaveUser>;
export const toApiSaveUser = (save: Save, user: User) => {
  const weightedScore = save.scoreDays
    ? {
        days: save.scoreDays,
        date: eu4DaysToDate(save.scoreDays),
      }
    : null;

  return {
    id: save.id,
    filename: save.filename,
    upload_time: dayjs(save.createdOn).toISOString(),
    user_name: user.display || user.steamName || "unknown",
    user_id: user.userId,
    date: save.date,
    days: save.days,
    player: save.player,
    displayed_country_name: save.displayedCountryName || save.player,
    player_start_tag: save.playerStartTag,
    player_start_tag_name: save.playerStartTagName,
    campaign_id: save.campaignId,
    ironman: save.ironman,
    multiplayer: save.multiplayer || false,
    patch: `${save.saveVersionFirst}.${save.saveVersionSecond}.${save.saveVersionThird}.${save.saveVersionFourth}`,
    dlc: save.dlc,
    achievements: save.achieveIds,
    weighted_score: weightedScore,
    game_difficulty: dbDifficulty(save.gameDifficulty),
    aar: save.aar,
    version: {
      first: save.saveVersionFirst,
      second: save.saveVersionSecond,
      third: save.saveVersionThird,
      fourth: save.saveVersionFourth,
    },
    encoding: save.encoding,
  };
};

export const toApiSave = (save: { saves: Save; users: User }): SaveFile => {
  return toApiSaveUser(save.saves, save.users);
};

function reverseRecord<T extends PropertyKey, U extends PropertyKey>(
  input: Record<T, U>
) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [value, key])
  ) as Record<U, T>;
}

const difficultyTable = {
  VeryEasy: "very_easy",
  Easy: "easy",
  Normal: "normal",
  Hard: "hard",
  VeryHard: "very_hard",
} as const;

const dbDifficultyTable = reverseRecord(difficultyTable);

export const dbDifficulty = (dbDiff: Save["gameDifficulty"]) =>
  dbDifficultyTable[dbDiff];
export const toDbDifficulty = (diff: SaveFile["game_difficulty"]) =>
  difficultyTable[diff];

export const apiKeyAtRest = (key: crypto.BinaryLike) => {
  return crypto.createHash("sha256").update(key).digest().toString("base64url");
};

export const fromParsedSave = (save: Partial<ParsedFile>): Partial<Save> => {
  const result: Partial<Save> = {
    date: save.date,
    days: save.days,
    player: save.player_tag,
    displayedCountryName: save.player_tag_name,
    playerStartTag: save.player_start_tag,
    playerStartTagName: save.player_start_tag_name,
    players: save.player_names,
    dlc: save.dlc_ids,
    campaignId: save.campaign_id,
    playthroughId: save.playthrough_id,
    ironman: save.is_ironman,
    multiplayer: save.is_multiplayer,
    achieveIds: save.achievements == null ? [] : save.achievements,
    gameDifficulty:
      save.game_difficulty && toDbDifficulty(save.game_difficulty),
    saveVersionFirst: save.patch?.first,
    saveVersionSecond: save.patch?.second,
    saveVersionThird: save.patch?.third,
    saveVersionFourth: save.patch?.fourth,
    checksum: save.checksum,
    encoding: save.encoding,
    scoreDays: save.score_days,
    hash: save.hash,
  };

  return Object.fromEntries(
    Object.entries(result).filter(([_, v]) => v !== undefined)
  );
};

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
});

export async function dbDisconnect() {
  await pool.end();
}

export const db = drizzle(pool);
export const table = {
  users,
  saves,
};
