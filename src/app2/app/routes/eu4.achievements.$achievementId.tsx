import { Alert } from "@/components/Alert";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WebPage } from "@/components/layout";
import { LoadingState } from "@/components/LoadingState";
import {
  AchievementLayout,
  AchievementPage,
} from "@/features/eu4/AchievementPage";
import { seo } from "@/lib/seo";
import { fetchAchievement, findAchievement } from "@/server-lib/fn/achievement";
import { defer, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Await, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";
import { z } from "zod";

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  seo({
    title: `${data?.achievement.name} Leaderboard`,
    description: `Top EU4 saves for ${data?.achievement.name}: ${data?.achievement.description}`,
  });

const ParamSchema = z.object({ achievementId: z.string() });
export const loader = ({ params: rawParams }: LoaderFunctionArgs) => {
  const params = ParamSchema.parse(rawParams);
  const achievement = findAchievement(params);
  const savesPromise = fetchAchievement(achievement);
  return defer({
    achievement,
    savesPromise,
  });
};

export default function Eu4Achievement() {
  const { achievement, savesPromise } = useLoaderData<typeof loader>();
  return (
    <WebPage>
      <AchievementLayout
        achievementId={`${achievement.id}`}
        description={achievement.description}
        title={achievement.name}
      >
        <ErrorBoundary
          fallback={({ error }) => (
            <div className="m-8">
              <Alert.Error
                className="px-4 py-2"
                msg={`Failed to fetch leaderboard: ${error}`}
              />
            </div>
          )}
        >
          <Suspense fallback={<LoadingState />}>
            <Await resolve={savesPromise}>
              {(saves: Awaited<ReturnType<typeof fetchAchievement>>) => (
                <AchievementPage achievement={saves} />
              )}
            </Await>
          </Suspense>
        </ErrorBoundary>
      </AchievementLayout>
    </WebPage>
  );
}
