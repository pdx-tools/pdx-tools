import { WebPage } from "@/components/layout/WebPage";
import { LoadingState } from "@/components/LoadingState";
import { Eu4GamePage, HUB_FEED_QUERY, PODIUM_LIMIT } from "@/features/eu4/Eu4GamePage";
import { seo } from "@/lib/seo";
import { mediaPreconnectLinks } from "@/lib/media";
import { usingDb } from "@/server-lib/db/connection";
import { loadAchievements } from "@/server-lib/game";
import { getFeed } from "@/server-lib/fn/feed";
import { getPodiumFinishes } from "@/server-lib/fn/achievement";
import { withCore } from "@/server-lib/middleware";
import { log } from "@/server-lib/logging";
import { pdxKeys } from "@/services/appApi";
import { Await, useLoaderData } from "react-router";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import type { Route } from "./+types/eu4._index";

export const meta = () =>
  seo({
    title: "EU4 - PDX Tools",
    description:
      "EU4 achievement leaderboards, the 1444 start of every patch, and recently shared campaigns",
  });

export const links = () => mediaPreconnectLinks;

export const loader = withCore(async ({ context }: Route.LoaderArgs) => {
  const { db, close } = usingDb(context);
  const queryClient = new QueryClient();
  // The two queries run side by side, so the podium adds no round trip.
  const prefetch = Promise.all([
    queryClient.fetchInfiniteQuery({
      queryKey: pdxKeys.feed(HUB_FEED_QUERY),
      queryFn: () => getFeed(db, { ...HUB_FEED_QUERY, cursor: undefined }),
      retry: false,
      initialPageParam: undefined,
    }),
    // The hub stands without the podium, as it stands without the feed.
    getPodiumFinishes(db, PODIUM_LIMIT).catch((error: unknown) => {
      log.exception(error, { msg: "failed to load podium finishes" });
      return null;
    }),
  ])
    .then(([, podium]) => ({ dehydratedState: dehydrate(queryClient), podium }))
    .finally(() => close());

  const achievements = loadAchievements().map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    difficulty: achievement.difficulty,
  }));

  return {
    achievements,
    prefetch,
  };
});

export default function Eu4Route() {
  const { achievements, prefetch } = useLoaderData<typeof loader>();

  return (
    <WebPage>
      <Suspense fallback={<LoadingState />}>
        <Await resolve={prefetch}>
          {({ dehydratedState, podium }) => (
            <HydrationBoundary state={dehydratedState}>
              <Eu4GamePage achievements={achievements} podium={podium} />
            </HydrationBoundary>
          )}
        </Await>
      </Suspense>
    </WebPage>
  );
}
