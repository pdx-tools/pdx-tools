import { ErrorCatcher, ErrorDisplay } from "@/features/errors";
import { WebPage } from "@/components/layout";
import { LoadingState } from "@/components/LoadingState";
import {
  AchievementLayout,
  AchievementPage,
} from "@/features/eu4/AchievementPage";
import { seo } from "@/lib/seo";
import { usingDb } from "@/server-lib/db/connection";
import { fetchAchievement, findAchievement } from "@/server-lib/fn/achievement";
import { withCore } from "@/server-lib/middleware";
import { Await, useLoaderData } from "react-router";
import { Suspense } from "react";
import { z } from "zod";
import type { Route } from "./+types/eu4.achievements.$achievementId";

export const meta = ({ data }: Route.MetaArgs) =>
  seo({
    title: `${data?.achievement.name} Leaderboard`,
    description: `Top EU4 saves for ${data?.achievement.name}: ${data?.achievement.description}`,
  });

const ParamSchema = z.object({ achievementId: z.string() });
export const loader = withCore(
  async ({ params: rawParams, context }: Route.LoaderArgs) => {
    const params = ParamSchema.parse(rawParams);
    const achievement = findAchievement(params);

    const { db, close } = usingDb(context);
    const savesPromise = fetchAchievement(db, achievement).finally(() =>
      close(),
    );
    return {
      achievement,
      savesPromise,
    };
  },
);

export default function Eu4Achievement() {
  const { achievement, savesPromise } = useLoaderData<typeof loader>();
  return (
    <WebPage>
      <AchievementLayout
        achievementId={`${achievement.id}`}
        description={achievement.description}
        title={achievement.name}
      >
        <ErrorCatcher
          fallback={(args) => (
            <ErrorDisplay
              {...args}
              title="Failed to fetch achievement leaderboard"
              className="m-8"
            />
          )}
        >
          <Suspense fallback={<LoadingState />}>
            <Await resolve={savesPromise}>
              {(saves) => <AchievementPage achievement={saves} />}
            </Await>
          </Suspense>
        </ErrorCatcher>
      </AchievementLayout>
    </WebPage>
  );
}
