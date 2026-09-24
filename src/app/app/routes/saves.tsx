import { WebPage } from "@/components/layout/WebPage";
import { LoadingState } from "@/components/LoadingState";
import { SavesFeedPage } from "@/features/saves/SavesFeedPage";
import { seo } from "@/lib/seo";
import { mediaPreconnectLinks } from "@/lib/media";
import { usingDb } from "@/server-lib/db/connection";
import { FeedGame, getFeed } from "@/server-lib/fn/feed";
import { withCore } from "@/server-lib/middleware";
import { pdxKeys } from "@/services/appApi";
import { Await, useLoaderData } from "react-router";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import type { Route } from "./+types/saves";

export const meta = () =>
  seo({
    title: "Shared saves - PDX Tools",
    description: "EU4 and EU5 campaigns shared by players, newest first",
  });

export const links = () => mediaPreconnectLinks;

const PAGE_SIZE = 25;

export const loader = withCore(async ({ request, context }: Route.LoaderArgs) => {
  const parsed = FeedGame.safeParse(new URL(request.url).searchParams.get("game"));
  const game = parsed.success ? parsed.data : undefined;

  const { db, close } = usingDb(context);
  const queryClient = new QueryClient();
  const prefetch = queryClient
    .fetchInfiniteQuery({
      queryKey: pdxKeys.feed({ game }),
      queryFn: () => getFeed(db, { game, pageSize: PAGE_SIZE, cursor: undefined }),
      retry: false,
      initialPageParam: undefined,
    })
    .then(() => dehydrate(queryClient))
    .finally(() => close());

  return { game, prefetch };
});

export default function SavesRoute() {
  const { game, prefetch } = useLoaderData<typeof loader>();

  return (
    <WebPage>
      <Suspense fallback={<LoadingState />}>
        <Await resolve={prefetch}>
          {(dehydratedState) => (
            <HydrationBoundary state={dehydratedState}>
              <SavesFeedPage game={game} />
            </HydrationBoundary>
          )}
        </Await>
      </Suspense>
    </WebPage>
  );
}
