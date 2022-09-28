// https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
import { PrismaClient, Save, User } from "@prisma/client";
import crypto from "crypto";
import dayjs from "dayjs";
import { GameDifficulty, SaveEncoding, SaveFile } from "@/services/appApi";
import { log } from "./logging";
import { metrics } from "./metrics";
import { eu4DaysToDate, ParsedFile } from "./pool";

// add prisma to the NodeJS global type
// @ts-ignore
interface CustomNodeJsGlobal extends NodeJS.Global {
  prisma: PrismaClient;
}

// Prevent multiple instances of Prisma Client in development
declare const global: CustomNodeJsGlobal;

const prisma = global.prisma || new PrismaClient();

const dbHistogram = new metrics.Histogram({
  name: "db_query",
  help: "db query middleware",
  labelNames: ["model", "action"] as const,
});

if (!global.prisma) {
  prisma.$use(async (params, next) => {
    const end = dbHistogram.startTimer({
      model: params.model,
      action: params.action,
    });
    const result = await next(params);
    const elapse = end();
    log.info({
      model: params.model,
      action: params.action,
      elapsedMs: (elapse * 1000).toFixed(2),
    });
    return result;
  });
}

if (process.env.NODE_ENV === "development") {
  global.prisma = prisma;
}

export const db = prisma;

export const toApiSave = (save: Save & { user: User }): SaveFile => {
  return toApiSaveUser(save, save.user);
};

function reverseRecord<T extends PropertyKey, U extends PropertyKey>(
  input: Record<T, U>
) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [value, key])
  ) as Record<U, T>;
}

const difficultyTable: Record<GameDifficulty, Save["gameDifficulty"]> = {
  VeryEasy: "VERY_EASY",
  Easy: "EASY",
  Normal: "NORMAL",
  Hard: "HARD",
  VeryHard: "VERY_HARD",
};

const dbDifficultyTable = reverseRecord(difficultyTable);

export const dbDifficulty = (dbDiff: Save["gameDifficulty"]): GameDifficulty =>
  dbDifficultyTable[dbDiff];
export const toDbDifficulty = (diff: GameDifficulty): Save["gameDifficulty"] =>
  difficultyTable[diff];

const encodingTable: Record<SaveEncoding, Save["encoding"]> = {
  text: "TEXT",
  binzip: "BINZIP",
  textzip: "TEXTZIP",
};

const dbEncodingTable = reverseRecord(encodingTable);

export const dbEncoding = (dbEncoding: Save["encoding"]): SaveEncoding =>
  dbEncodingTable[dbEncoding];
export const toDbEncoding = (encoding: SaveEncoding): Save["encoding"] =>
  encodingTable[encoding];

export const apiKeyAtRest = (key: crypto.BinaryLike) => {
  return crypto.createHash("sha256").update(key).digest().toString("base64url");
};

export const toApiSaveUser = (save: Save, user: User): SaveFile => {
  const difficulty = dbDifficulty(save.gameDifficulty);
  const encoding = dbEncoding(save.encoding);

  const weightedScore = save.score_days
    ? {
        days: save.score_days,
        date: eu4DaysToDate(save.score_days),
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
    game_difficulty: difficulty,
    aar: save.aar,
    version: {
      first: save.saveVersionFirst,
      second: save.saveVersionSecond,
      third: save.saveVersionThird,
      fourth: save.saveVersionFourth,
    },
    encoding,
  };
};

export const fromApiSave = (save: Partial<ParsedFile>): Partial<Save> => {
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
    ...(save.game_difficulty && { gameDifficulty: save.game_difficulty }),
    ...(save.patch?.first && { saveVersionFirst: save.patch.first }),
    ...(save.patch?.second && { saveVersionFirst: save.patch.second }),
    ...(save.patch?.third && { saveVersionFirst: save.patch.third }),
    ...(save.patch?.fourth && { saveVersionFirst: save.patch.fourth }),
    ...(save.checksum && { checksum: save.checksum }),
    ...(save.encoding && { encoding: save.encoding }),
  };
};
