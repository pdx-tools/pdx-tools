import dayjs from "dayjs";
import { eu4DaysToDate } from "../game";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Save, User, saves, users } from "./schema";
import { ParsedFile } from "../save-parser";
import { NextRequest, NextResponse } from "next/server";
export {
  type User,
  type Save,
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
    user_name: user.display ?? user.steamName ?? "unknown",
    user_id: user.userId,
    date: save.date,
    days: save.days,
    player_tag: save.playerTag,
    player_tag_name: save.playerTagName ?? save.playerTag,
    player_start_tag: save.playerStartTag,
    player_start_tag_name: save.playerStartTagName,
    patch: `${save.saveVersionFirst}.${save.saveVersionSecond}.${save.saveVersionThird}.${save.saveVersionFourth}`,
    playthrough_id: save.playthroughId,
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
  };
};

export const toApiSave = (save: { saves: Save; users: User }): SaveFile => {
  return toApiSaveUser(save.saves, save.users);
};

function reverseRecord<T extends PropertyKey, U extends PropertyKey>(
  input: Record<T, U>,
) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [value, key]),
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

export const apiKeyAtRest = async (key: string) => {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest({ name: "SHA-256" }, data);
  return Buffer.from(digest).toString("base64url");
};

export const fromParsedSave = (save: Partial<ParsedFile>): Partial<Save> => {
  const result: Partial<Save> = {
    date: save.date,
    days: save.days,
    playerTag: save.player_tag,
    playerTagName: save.player_tag_name,
    playerStartTag: save.player_start_tag,
    playerStartTagName: save.player_start_tag_name,
    players: save.player_names,
    playthroughId: save.playthrough_id,
    achieveIds: save.achievements == null ? [] : save.achievements,
    gameDifficulty:
      save.game_difficulty && toDbDifficulty(save.game_difficulty),
    saveVersionFirst: save.patch?.first,
    saveVersionSecond: save.patch?.second,
    saveVersionThird: save.patch?.third,
    saveVersionFourth: save.patch?.fourth,
    scoreDays: save.score_days,
    hash: save.hash,
  };

  return Object.fromEntries(
    Object.entries(result).filter(([_, v]) => v !== undefined),
  );
};

export async function useDb<T>(
  fn: (db: ReturnType<typeof drizzle>) => Promise<T>,
) {
  return fn(dbPool().orm);
}

type DbDrizzle = ReturnType<typeof drizzle>;
export type DbRoute = { dbConn: Promise<ReturnType<typeof drizzle>> };

function createDbPool() {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  return {
    pool,
    orm: drizzle(pool),
  };
}

let dbDrizzle: { orm: DbDrizzle; pool: Pool } | undefined;
function dbPool() {
  return (dbDrizzle ??= createDbPool());
}

export function withDb<T = unknown, R = {}>(
  fn: (
    req: NextRequest,
    context: R & DbRoute,
  ) => Promise<NextResponse<T> | Response>,
) {
  return async (
    req: NextRequest,
    ctxt: R,
  ): Promise<NextResponse<T> | Response> => {
    const dbConn = Promise.resolve(dbPool().orm);
    return await fn(req, { ...ctxt, dbConn });
  };
}

export async function dbDisconnect() {
  await dbPool().pool.end();
}

export const table = {
  users,
  saves,
};
