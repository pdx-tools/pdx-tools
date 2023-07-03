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
  return {
    ...(save.date && { date: save.date }),
    ...(save.days && { days: save.days }),
    ...(save.player_tag && { player: save.player_tag }),
    ...(save.player_names && { players: save.player_names }),
    ...(save.player_start_tag && { playerStartTag: save.player_start_tag }),
    ...(save.player_start_tag_name && {
      playerStartTagName: save.player_start_tag_name,
    }),
    ...(save.dlc_ids && { dlc: save.dlc_ids }),
    ...(save.campaign_id && { campaignId: save.campaign_id }),
    ...(save.playthrough_id && { campaignId: save.playthrough_id }),
    ...(save.is_ironman && { ironman: save.is_ironman }),
    ...(save.is_multiplayer && { multiplayer: save.is_multiplayer }),
    ...(save.achievements && { achieveIds: save.achievements }),
    ...(save.game_difficulty && {
      gameDifficulty: toDbDifficulty(save.game_difficulty),
    }),
    ...(save.patch?.first && { saveVersionFirst: save.patch.first }),
    ...(save.patch?.second && { saveVersionFirst: save.patch.second }),
    ...(save.patch?.third && { saveVersionFirst: save.patch.third }),
    ...(save.patch?.fourth && { saveVersionFirst: save.patch.fourth }),
    ...(save.checksum && { checksum: save.checksum }),
    ...(save.encoding && { encoding: save.encoding }),
    ...(save.score_days && { scoreDays: save.score_days }),
    ...(save.hash && { hash: save.hash }),
  };
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
