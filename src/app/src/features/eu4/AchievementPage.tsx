import React, { useMemo } from "react";
import { RecordTable } from "./components/RecordTable";
import { Achievement, pdxApi } from "@/services/appApi";
import { Alert } from "@/components/Alert";

interface AchievementRoute {
  achievementId: string;
  staticAchievement?: Achievement;
}

const useAchievement = (achievementId: string) => {
  const achievementQuery = pdxApi.achievement.useGet(achievementId);
  const achievement = achievementQuery.data?.achievement;
  const saves = useMemo(
    () =>
      (achievementQuery.data?.saves ?? []).map((x, i) => ({
        ...x,
        rank: i + 1,
      })),
    [achievementQuery.data],
  );

  return {
    isFetching: achievementQuery.isFetching,
    error: achievementQuery.error,
    achievement,
    saves,
  };
};

export const AchievementPage = ({
  achievementId,
  staticAchievement,
}: AchievementRoute) => {
  const { achievement, saves, error } = useAchievement(achievementId);

  const title = achievement?.name ?? staticAchievement?.name ?? "";
  const table = saves === undefined ? null : <RecordTable records={saves} />;
  const description =
    achievement?.description ?? staticAchievement?.description ?? "";

  return (
    <div className="mx-auto max-w-7xl p-5">
      <h1 className="text-4xl">{title}</h1>
      <p>Achievement id: {achievementId}</p>
      <p>{description}</p>
      <Alert.Error className="px-4 py-2" msg={error} />
      <div className="mt-5">{table}</div>
    </div>
  );
};
