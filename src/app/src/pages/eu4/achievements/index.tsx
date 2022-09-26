import { GetStaticProps } from "next";
import React from "react";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";
import { Achievement } from "@/services/appApi";
import { AchievementsPage } from "@/features/eu4/AchievementsPage";

interface StaticAchievements {
  achievements?: Achievement[];
}

export const Eu4Achievements = ({ achievements }: StaticAchievements) => {
  return (
    <>
      <HtmlHead>
        <title>EU4 Achievements - PDX Tools</title>
        <meta
          name="description"
          content="List of supported EU4 achievements and current record time"
        ></meta>
      </HtmlHead>
      <AppStructure>
        <AchievementsPage staticAchievements={achievements} />
      </AppStructure>
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
  }));

  return {
    props: {
      achievements: result,
    },
  };
};
