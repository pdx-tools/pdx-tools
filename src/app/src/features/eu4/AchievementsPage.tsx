import React from "react";
import { AchievementsTable } from "@/features/eu4/components/AchievementsTable";
import { Achievement } from "@/services/appApi";

interface AchievementsPageProps {
  staticAchievements?: Achievement[];
}

export const AchievementsPage = ({
  staticAchievements,
}: AchievementsPageProps) => {
  return (
    <div className="mx-auto max-w-5xl p-5">
      <h1 className="text-4xl">Achievements</h1>
      <p className="mb-5">EU4 achievements recognized by PDX Tools</p>
      <AchievementsTable
        achievements={(staticAchievements ?? []).map((x) => ({
          achievement: x,
        }))}
      />
    </div>
  );
};
