import { GetStaticProps } from "next";
import React from "react";
import { HtmlHead } from "@/components/head";
import { RakalyStructure } from "@/components/layout";
import { type AchievementUploads } from "@/features/eu4/components/AchievementsTable";
import { Achievement } from "@/services/rakalyApi";
import { AchievementsPage } from "@/features/eu4/AchievementsPage";

interface StaticAchievements {
  achievements?: AchievementUploads[];
}

export const Eu4Achievements: React.FC<StaticAchievements> = ({
  achievements,
}) => {
  return (
    <>
      <HtmlHead>
        <title>EU4 Achievements - Rakaly</title>
        <meta
          name="description"
          content="List of supported EU4 achievements and current record time"
        ></meta>
      </HtmlHead>
      <RakalyStructure>
        <AchievementsPage staticAchievements={achievements} />
      </RakalyStructure>
    </>
  );
};

export default Eu4Achievements;

export const getStaticProps: GetStaticProps<StaticAchievements> = async (
  _context
) => {
  const { loadAchievements } = require("@/server-lib/pool");
  const achievements: Achievement[] = loadAchievements();
  const result = achievements.map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    difficulty: achievement.difficulty,
    uploads: 0,
  }));

  return {
    props: {
      achievements: result,
    },
  };
};
