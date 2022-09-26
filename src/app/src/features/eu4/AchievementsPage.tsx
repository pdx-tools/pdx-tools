import React from "react";
import { PageHeader } from "antd";
import { AchievementsTable } from "@/features/eu4/components/AchievementsTable";
import { Achievement } from "@/services/appApi";

interface AchievementsPageProps {
  staticAchievements?: Achievement[];
}

export const AchievementsPage = ({
  staticAchievements,
}: AchievementsPageProps) => {
  return (
    <PageHeader
      backIcon={false}
      title="Achievements"
      subTitle="EU4 achievements recognized by PDX Tools"
      style={{ maxWidth: "1000px", margin: "0 auto" }}
    >
      <AchievementsTable
        achievements={(staticAchievements ?? []).map((x) => ({
          achievement: x,
        }))}
      />
    </PageHeader>
  );
};
