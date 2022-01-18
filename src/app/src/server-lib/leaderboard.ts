import { Save } from ".prisma/client";
import { ApiAchievementsResponse } from "../services/rakalyApi";
import { db } from "./db";
import { ParsedFile, loadAchievements } from "./pool";
import { redisClient } from "./redis";

const TOP_N = 10;

interface LeaderboardEligibleOptions {
  days: number;
  achievements: number[];
  campaignId: string;
  playthroughId: string | null;
}

export async function leaderboardEligible({
  days,
  achievements,
  campaignId,
  playthroughId,
}: LeaderboardEligibleOptions) {
  const breaking = await isRecordBreaking(days, achievements);
  if (!breaking) {
    return false;
  }

  const playthroughSaves = await db.save.findMany({
    where: {
      OR: [{ campaignId }, { playthroughId }],
    },
  });

  const records = achievements.map((id) =>
    playthroughSaves
      .filter((save) => save.achieveIds.includes(id))
      .reduce((acc, x) => Math.min(acc, x.days), days + 1)
  );

  return (
    playthroughSaves.length == 0 || records.findIndex((x) => days < x) !== -1
  );
}

export const isRecordBreaking = async (
  score: number,
  achievementIds: number[]
): Promise<boolean> => {
  const client = await redisClient();
  for (let i = 0; i < achievementIds.length; i++) {
    const achieveId = achievementIds[i];

    const entries = await client.zRangeWithScores(
      `achievement_scores:${achieveId}`,
      TOP_N - 1,
      TOP_N - 1
    );

    if (entries.length === 0 || score < entries[0].score) {
      return true;
    }
  }

  return false;
};

export const addToLeaderboard = async (
  saveId: string,
  save: ParsedFile,
  epoch: number
) => {
  const achievementIds = save.achievements || [];
  const client = await redisClient();

  let epochStr = Math.floor(epoch).toString();
  while (epochStr.length < 15) {
    epochStr = "0" + epochStr;
  }

  for (let i = 0; i < achievementIds.length; i++) {
    const achievement = achievementIds[i];
    const entry = {
      score: parseFloat(`${save.days}.${epochStr}`),
      value: saveId,
    };

    await client.zAdd(
      `raw_achievement_scores:${achievement}:${save.patch_shorthand}`,
      entry
    );

    const topEntry = {
      score: parseFloat(`${save.weighted_score}.${epochStr}`),
      value: saveId,
    };

    await client.zAdd(`achievement_scores:${achievement}`, topEntry);
  }
};

export const removeFromLeaderboard = async (save: Save) => {
  const client = await redisClient();
  const patch = `${save.saveVersionFirst}.${save.saveVersionSecond}`;
  for (let i = 0; i < save.achieveIds.length; i++) {
    const achievementId = save.achieveIds[i];
    const raw = `raw_achievement_scores:${achievementId}:${patch}`;
    const top = `achievement_scores:${achievementId}`;
    await client.zRem(raw, save.id);
    await client.zRem(top, save.id);
  }

  const decr = save.saveSlot ? -1 : 0;
  await client.zIncrBy("user_uploads_used_save_slots", decr, save.userId);
};

export const getAchievementLeaderboardSaveIds = async (
  achievementId: number
): Promise<string[]> => {
  const client = await redisClient();
  return client.zRange(`achievement_scores:${achievementId}`, 0, 99);
};

export const countAchievementUploads = async (
  achievementId: number
): Promise<number> => {
  const client = await redisClient();
  return client.zCard(`achievement_scores:${achievementId}`);
};

export const achievementsWithTopSaves = async (): Promise<
  ApiAchievementsResponse["achievements"]
> => {
  const client = await redisClient();
  const achievements = loadAchievements();
  const result = [];
  for (let i = 0; i < achievements.length; i++) {
    const achievement = achievements[i];
    const achievementId = achievement.id;
    const key = `achievement_scores:${achievementId}`;
    const topSaves = await client.zRange(key, 0, 0);
    const uploads = await client.zCard(key);
    result.push({
      top_save_id: topSaves?.[0] ?? null,
      uploads,
      id: achievementId,
      name: achievement.name,
      description: achievement.description,
      difficulty: achievement.difficulty,
    });
  }

  return result;
};
