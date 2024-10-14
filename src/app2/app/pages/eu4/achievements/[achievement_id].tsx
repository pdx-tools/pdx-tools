import React, { Suspense } from "react";
import { useRouter } from "next/router";
import { HtmlHead } from "@/components/head";
import { Root, WebPage } from "@/components/layout";
import {
  AchievementLayout,
  AchievementPage,
} from "@/features/eu4/AchievementPage";
import { Achievement } from "@/services/appApi";
import { GetStaticProps } from "next";
import { getAchievement, loadAchievements } from "@/server-lib/game";
import { Alert } from "@/components/Alert";
import { ErrorBoundary } from "@sentry/react";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Csr } from "@/components/Csr";
import { LoadingState } from "@/components/LoadingState";

interface StaticAchievement {
  achievement?: Achievement;
}

function AchievementFallback({
  children,
  achievement,
}: React.PropsWithChildren<{ achievement?: Achievement }>) {
  return achievement ? (
    <AchievementLayout
      achievementId={`${achievement.id}`}
      description={achievement.description}
      title={achievement.name}
    >
      {children}
    </AchievementLayout>
  ) : (
    <>{children}</>
  );
}

export const Eu4Achievement = ({ achievement }: StaticAchievement) => {
  const router = useRouter();
  const { achievement_id } = router.query;

  if (typeof achievement_id !== "string" || Array.isArray(achievement_id)) {
    return null;
  }

  const prefix = achievement
    ? `${achievement.name} (${achievement.id}) - `
    : "";
  const title = `${prefix}EU4 Achievements - PDX Tools`;

  return (
    <Root>
      <HtmlHead>
        <title>{title}</title>
        <meta
          name="description"
          content={`Leaderboard for EU4 achievement${
            achievement && ` ${achievement.name}: ${achievement.description}`
          }`}
        ></meta>
      </HtmlHead>
      <WebPage>
        <Suspense
          fallback={
            <AchievementFallback achievement={achievement}>
              <LoadingState />
            </AchievementFallback>
          }
        >
          <ErrorBoundary
            fallback={({ error }) => (
              <AchievementFallback achievement={achievement}>
                <div className="m-8">
                  <Alert.Error
                    className="px-4 py-2"
                    msg={`Failed to fetch leaderboard: ${error}`}
                  />
                </div>
              </AchievementFallback>
            )}
          >
            <Csr>
              <AchievementPage achievementId={achievement_id} />
            </Csr>
          </ErrorBoundary>
        </Suspense>
      </WebPage>
    </Root>
  );
};

export default Eu4Achievement;

export async function getStaticPaths() {
  const achievements: Achievement[] = loadAchievements();
  const paths = achievements.map((x) => ({
    params: { achievement_id: x.id.toString() },
  }));
  return { paths, fallback: false };
}

export const getStaticProps: GetStaticProps<StaticAchievement> = async ({
  params,
}) => {
  const achievementId = +(params?.achievement_id ?? "0");
  const achievement: Achievement | undefined = getAchievement(achievementId);

  if (achievement === undefined) {
    throw new Error("achievement needs to be defined");
  }

  return {
    props: {
      achievement,
    },
  };
};
