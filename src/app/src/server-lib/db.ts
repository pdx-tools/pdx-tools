// https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
import { PrismaClient, Save, User } from "@prisma/client";
import dayjs from "dayjs";
import { GameDifficulty, SaveEncoding, SaveFile } from "@/services/rakalyApi";
import { log } from "./logging";
import { metrics } from "./metrics";
import { calcWeightedScore } from "./pool";

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

const dbDifficulty = (dbDiff: Save["gameDifficulty"]): GameDifficulty => {
  switch (dbDiff) {
    case "VERY_EASY":
      return "VeryEasy";
    case "EASY":
      return "Easy";
    case "NORMAL":
      return "Normal";
    case "HARD":
      return "Hard";
    case "VERY_HARD":
      return "VeryHard";
  }
};

const dbEncoding = (dbEncoding: Save["encoding"]): SaveEncoding => {
  switch (dbEncoding) {
    case "BINZIP":
      return "binzip";
    case "TEXT":
      return "text";
    case "TEXTZIP":
      return "textzip";
  }
};

export const toApiSaveUser = (save: Save, user: User): SaveFile => {
  const difficulty = dbDifficulty(save.gameDifficulty);
  const encoding = dbEncoding(save.encoding);
  let weighted_score = null;
  if (save.achieveIds) {
    weighted_score = calcWeightedScore(
      save.saveVersionFirst,
      save.saveVersionSecond,
      save.days
    );
  }

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
    weighted_score,
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
