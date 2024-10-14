import dayjs from "dayjs";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { GameDifficulty, Save, saves, users } from "./schema";
import { ParsedFile } from "../save-parser";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
export {
  type User,
  type Save,
  type GameDifficulty,
  type NewSave,
} from "./schema";

const { Pool } = pg;

export const userView = {
  get userName() {
    return sql<string>`COALESCE(NULLIF(${table.users.display}, ''), NULLIF(${table.users.steamName}, ''), 'unknown')`;
  },
};

export function saveView<S, U>(opts?: { save?: S; user?: U }) {
  const saveColumns = {
    id: table.saves.id,
    upload_time: table.saves.createdOn,
    date: table.saves.date,
    player_tag: table.saves.playerTag,
    player_tag_name: table.saves.playerTagName,
    player_start_tag: table.saves.playerStartTag,
    player_start_tag_name: table.saves.playerStartTagName,
    patch: sql<string>`CONCAT(${table.saves.saveVersionFirst}, '.', ${table.saves.saveVersionSecond}, '.', ${table.saves.saveVersionThird}, '.', ${table.saves.saveVersionFourth})`,
    difficulty: table.saves.gameDifficulty,
    achievements: table.saves.achieveIds,
    ...opts?.save,
  } as const;

  const userColumns = {
    user_id: table.users.userId,
    user_name: userView.userName,
  } as const;

  return {
    save: {
      ...saveColumns,
      ...opts?.save,
    } as typeof saveColumns & S,
    user: {
      ...userColumns,
      ...opts?.user,
    } as typeof userColumns & U,
  };
}

type DbRow = { upload_time: Date; difficulty: GameDifficulty };
export function toApiSave<T extends DbRow>({
  upload_time,
  difficulty,
  ...save
}: T) {
  return {
    ...save,
    upload_time: dayjs(upload_time).toISOString(),
    game_difficulty: dbDifficulty(difficulty),
  };
}

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

export const dbDifficulty = (dbDiff: GameDifficulty) =>
  dbDifficultyTable[dbDiff];
export const toDbDifficulty = (diff: keyof typeof difficultyTable) =>
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
export type DbConnection = ReturnType<typeof drizzle>;
export type DbTransaction = Parameters<
  Parameters<DbConnection["transaction"]>[0]
>[0];
export type DbRoute = { dbConn: Promise<DbConnection> };

function createDbPool() {
  const pool = new Pool({ connectionString: import.meta.env["VITE_DATABASE_URL"] });
  return {
    pool,
    orm: drizzle(pool),
  };
}

let dbDrizzle: ReturnType<typeof createDbPool> | undefined;
export function dbPool() {
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
