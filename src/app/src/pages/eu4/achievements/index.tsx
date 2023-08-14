import { GetStaticProps } from "next";
import React from "react";
import { HtmlHead } from "@/components/head";
import { Root, WebPage } from "@/components/layout";
import { Achievement } from "@/services/appApi";
import { AchievementsPage } from "@/features/eu4/AchievementsPage";
import { loadAchievements } from "@/server-lib/game";

interface StaticAchievements {
  achievements?: Achievement[];
}

export const Eu4Achievements = ({ achievements }: StaticAchievements) => {
  return (
    <Root>
      <HtmlHead>
        <title>EU4 Achievements - PDX Tools</title>
        <meta
          name="description"
          content="List of supported EU4 achievements and current record time"
        ></meta>
      </HtmlHead>
      <WebPage>
        <AchievementsPage staticAchievements={achievements} />
      </WebPage>
    </Root>
  );
};

export default Eu4Achievements;

export const getStaticProps: GetStaticProps<StaticAchievements> = async (
  _context,
) => {
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
