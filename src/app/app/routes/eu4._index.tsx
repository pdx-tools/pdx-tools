import { WebPage } from "@/components/layout/WebPage";
import { LoadingState } from "@/components/LoadingState";
import { Eu4GamePage, HUB_FEED_QUERY } from "@/features/eu4/Eu4GamePage";
import { seo } from "@/lib/seo";
import { mediaPreconnectLinks } from "@/lib/media";
import { usingDb } from "@/server-lib/db/connection";
import { getFeed } from "@/server-lib/fn/feed";
import { withCore } from "@/server-lib/middleware";
import { pdxKeys } from "@/services/appApi";
import { Await, useLoaderData } from "react-router";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import type { Route } from "./+types/eu4._index";

export const meta = () =>
  seo({
    title: "EU4 - PDX Tools",
    description: "Recent EU4 saves, the 1444 start of every patch, and the achievement leaderboard",
  });

export const links = () => mediaPreconnectLinks;

export const loader = withCore(async ({ context }: Route.LoaderArgs) => {
  const { db, close } = usingDb(context);
  const queryClient = new QueryClient();
  const prefetch = queryClient
    .fetchInfiniteQuery({
      queryKey: pdxKeys.feed(HUB_FEED_QUERY),
      queryFn: () => getFeed(db, { ...HUB_FEED_QUERY, cursor: undefined }),
      retry: false,
      initialPageParam: undefined,
    })
    .then(() => dehydrate(queryClient))
    .finally(() => close());

  return {
    prefetch,
  };
});

export default function Eu4Route() {
  const { prefetch } = useLoaderData<typeof loader>();

  return (
    <WebPage>
      <Suspense fallback={<LoadingState />}>
        <Await resolve={prefetch}>
          {(dehydratedState) => (
            <HydrationBoundary state={dehydratedState}>
              <Eu4GamePage />
            </HydrationBoundary>
          )}
        </Await>
      </Suspense>
    </WebPage>
  );
}
