import React from "react";
import { RecordTable } from "./components/RecordTable";
import { AchievementAvatar } from "./components/avatars";
import { AchievementPodium } from "./AchievementPodium";
import type { fetchAchievement } from "@/server-lib/fn/achievement";

export const AchievementLayout = ({
  achievementId,
  title,
  description,
  children,
}: React.PropsWithChildren<{
  achievementId: string;
  title: string;
  description: string;
}>) => {
  return (
    <div className="mx-auto mt-8 max-w-7xl p-5">
      <div className="mx-auto flex max-w-3xl flex-col">
        <div className="flex items-center gap-3">
          <AchievementAvatar id={achievementId} size={40} />
          <h1 className="text-4xl">{title} Leaderboard</h1>
        </div>
        <div className="mt-3 max-w-prose leading-snug">
          <p className="text-gray-600 dark:text-gray-300">{description}</p>
        </div>
        <div className="mt-2 max-w-prose leading-snug">
          <p className="text-gray-600 dark:text-gray-300">
            Achievement leaderboards are based on patch in-game days: the number of elapsed in game
            days, taxed 10% per patch behind the latest EU4 minor version
          </p>
        </div>
      </div>

      {children}
    </div>
  );
};

export const AchievementPage = ({
  achievement: data,
}: {
  achievement: Awaited<ReturnType<typeof fetchAchievement>>;
}) => {
  const [gold, silver, bronze, ...rest] = data.saves;
  return (
    <div className="flex flex-col gap-10">
      <AchievementPodium saves={[gold, silver, bronze]} />
      {data.goldDate ? (
        <div className="text-center">
          <p className="text-xl">Earn gold by completing the achievement before:</p>
          <p className="text-3xl font-semibold">{data.goldDate}</p>
        </div>
      ) : null}
      {rest.length ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-center text-lg font-semibold">Other completions:</h2>
          <RecordTable records={rest} />
        </div>
      ) : null}
    </div>
  );
};
