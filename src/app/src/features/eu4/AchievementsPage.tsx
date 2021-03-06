import React, { useMemo } from "react";
import { PageHeader, Spin } from "antd";
import {
  AchievementsTable,
  AchievementUploads,
} from "@/features/eu4/components/AchievementsTable";
import { appApi, SaveFile } from "@/services/appApi";

const useAchievements = () => {
  const { isFetching, isUninitialized, data } =
    appApi.endpoints.getAchievements.useQuery();

  const achievements = useMemo(() => {
    const saves = new Map(data?.saves.map((x) => [x.id, x]));

    return (
      data?.achievements.map((x) => ({
        achievement: {
          ...x,
        },
        topSave: saves.get(x.top_save_id ?? ""),
      })) || []
    );
  }, [data]);

  return {
    isFetching: isUninitialized || isFetching,
    achievements,
  };
};

interface AchievementsPageProps {
  staticAchievements?: AchievementUploads[];
}

export const AchievementsPage = ({
  staticAchievements,
}: AchievementsPageProps) => {
  const { isFetching, achievements } = useAchievements();

  let extras = [];
  if (isFetching) {
    extras.push(<Spin key="spinner" size="small" />);
  }

  const data =
    achievements.length > 0
      ? achievements
      : (staticAchievements || []).map((x) => ({
          achievement: x,
          topSave: undefined as SaveFile | undefined,
        }));

  return (
    <PageHeader
      backIcon={false}
      title="Achievements"
      subTitle="EU4 achievements recognized by PDX Tools"
      extra={[extras]}
      style={{ maxWidth: "1000px", margin: "0 auto" }}
    >
      <AchievementsTable achievements={data} />
    </PageHeader>
  );
};
