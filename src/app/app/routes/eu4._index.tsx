import { WebPage } from "@/components/layout/WebPage";
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
import { useLoaderData } from "react-router";
import { dehydrate, QueryClient } from "@tanstack/react-query";
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
  // The two queries run side by side and stream in apart, so the page and
  // its achievement wall do not wait for them.
  const feed = queryClient
    .fetchInfiniteQuery({
      queryKey: pdxKeys.feed(HUB_FEED_QUERY),
      queryFn: () => getFeed(db, { ...HUB_FEED_QUERY, cursor: undefined }),
      retry: false,
      initialPageParam: undefined,
    })
    .then(() => dehydrate(queryClient));
  // The hub stands without the podium, as it stands without the feed.
  const podium = getPodiumFinishes(db, PODIUM_LIMIT).catch((error: unknown) => {
    log.exception(error, { msg: "failed to load podium finishes" });
    return null;
  });
  void Promise.allSettled([feed, podium]).finally(() => close());

  const achievements = loadAchievements().map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    difficulty: achievement.difficulty,
  }));

  return { achievements, feed, podium };
});

export default function Eu4Route() {
  const { achievements, feed, podium } = useLoaderData<typeof loader>();

  return (
    <WebPage>
      <Eu4GamePage achievements={achievements} feed={feed} podium={podium} />
    </WebPage>
  );
}
