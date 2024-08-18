import React from "react";
import { RecordTable } from "./components/RecordTable";
import { pdxApi } from "@/services/appApi";
import { AchievementAvatar } from "./components/avatars";
import { useToastOnError } from "@/hooks/useToastOnError";

interface AchievementRoute {
  achievementId: string;
}

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
    <div className="mx-auto max-w-7xl p-5 mt-8">
      <div className="flex gap-3">
        <AchievementAvatar id={achievementId} size={40} />
        <h1 className="text-4xl">{title} Leaderboard</h1>
        <p className="text-2xl self-end tracking-tighter text-gray-400">
          (id: {achievementId})
        </p>
      </div>
      <div className="mt-3 max-w-prose leading-snug">
        <p className="text-gray-600 dark:text-gray-300">{description}</p>
      </div>
      <div className="mt-2 max-w-prose leading-snug">
        <p className="text-gray-600 dark:text-gray-300">
          Achievement leaderboards score saves based on the number of elapsed in
          game days, taxed 10% per patch behind the latest EU4 minor version
        </p>
      </div>
      {children}
    </div>
  );
};

export const AchievementPage = ({ achievementId }: AchievementRoute) => {
  const achievementQuery = pdxApi.achievement.useGet(achievementId);
  useToastOnError(achievementQuery.error, "Achievement data refresh failed");
  const achievement = achievementQuery.data.achievement;

  return (
    <AchievementLayout
      achievementId={`${achievement.id}`}
      description={achievement.description}
      title={achievement.name}
    >
      <div className="mt-10">
        <RecordTable records={achievementQuery.data.saves} />
      </div>
    </AchievementLayout>
  );
};
