import React from "react";
import { useRouter } from "next/router";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";
import { AchievementPage } from "@/features/eu4/AchievementPage";
import { Achievement } from "@/services/appApi";
import { GetStaticProps } from "next";

interface StaticAchievement {
  achievement?: Achievement;
}

export const Eu4Achievement = ({ achievement }: StaticAchievement) => {
  const router = useRouter();
  const { achievement_id } = router.query;
  return (
    <>
      <HtmlHead>
        <title>
          {achievement && `${achievement.name} (${achievement.id}) - `} EU4
          Achievements - PDX Tools
        </title>
        <meta
          name="description"
          content={`Leaderboard for EU4 achievement${
            achievement && ` ${achievement.name}: ${achievement.description}`
          }`}
        ></meta>
      </HtmlHead>
      <AppStructure>
        {achievement !== undefined ? (
          <AchievementPage
            achievementId={achievement.id.toString()}
            staticAchievement={achievement}
          />
        ) : typeof achievement_id === "string" &&
          !Array.isArray(achievement_id) ? (
          <AchievementPage achievementId={achievement_id} />
        ) : null}
      </AppStructure>
    </>
  );
};

export default Eu4Achievement;

export async function getStaticPaths() {
  const { loadAchievements } = require("@/server-lib/pool");
  const achievements: Achievement[] = loadAchievements();
  const paths = achievements.map((x) => ({
    params: { achievement_id: x.id.toString() },
  }));
  return { paths, fallback: false };
}

export const getStaticProps: GetStaticProps<StaticAchievement> = async ({
  params,
}) => {
  const { getAchievement } = require("@/server-lib/pool");
  const achievement: Achievement | undefined = getAchievement(
    params?.achievement_id
  );

  if (achievement === undefined) {
    throw new Error("achievement needs to be defined");
  }

  return {
    props: {
      achievement,
    },
  };
};
