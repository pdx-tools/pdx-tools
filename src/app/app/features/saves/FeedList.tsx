import { useMemo } from "react";
import { pdxApi } from "@/services/appApi";
import type { FeedQuery } from "@/services/appApi";
import { useToastOnError } from "@/hooks/useToastOnError";
import { DISCORD_INVITE_URL } from "@/lib/links";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Link } from "@/components/Link";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { FeedEntryCard, FeedEntryTile } from "./FeedEntryCard";
import { SaveTileItem, SaveTileList } from "./SaveTile";

const GAME_LABEL = { eu4: "EU4", eu5: "EU5" } as const;

/**
 * Shared campaigns, latest upload first. With `infinite` the list keeps
 * loading as the reader scrolls; without it, one page is shown. `compact`
 * gives a tile per campaign instead of a card, for a surface that points at
 * the feed rather than being one. A compact list does not load more.
 * `showNames` passes on to each card; `empty` replaces the text shown when
 * there is no campaign.
 */
export function FeedList({
  query,
  infinite = true,
  compact = false,
  showNames = false,
  empty,
}: {
  query: FeedQuery;
  infinite?: boolean;
  compact?: boolean;
  showNames?: boolean;
  empty?: React.ReactNode;
}) {
  const { data, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, error } =
    pdxApi.saves.useFeed(query);

  useToastOnError(error, "Failed to fetch shared saves");
  const campaigns = useMemo(() => data.pages.flatMap((x) => x.campaigns), [data]);

  // Any fetch pauses the observer, as the next page would cancel a refetch
  // of the pages that are shown. Only the next page shows the spinner.
  const { ref } = useIntersectionObserver<HTMLDivElement>({
    enabled: infinite && !isFetching && !error,
    onIntersect: hasNextPage ? fetchNextPage : undefined,
    rootMargin: "200px",
    threshold: 0,
  });

  if (campaigns.length === 0) {
    if (empty) {
      return empty;
    }
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-400/70 px-6 py-10 text-center text-gray-600 dark:text-gray-400">
        {query.game === "eu5" ? (
          <>
            <p>EU5 sharing is in a closed beta. No EU5 campaigns are shared yet.</p>
            <Link href={DISCORD_INVITE_URL}>Ask on Discord to join the beta</Link>
          </>
        ) : (
          <p>No {query.game ? `${GAME_LABEL[query.game]} ` : ""}saves shared yet.</p>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <SaveTileList>
        {campaigns.map((campaign) => (
          <SaveTileItem key={`${campaign.game}:${campaign.key}`}>
            <FeedEntryTile campaign={campaign} />
          </SaveTileItem>
        ))}
      </SaveTileList>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {campaigns.map((campaign) => (
        <FeedEntryCard
          key={`${campaign.game}:${campaign.key}`}
          campaign={campaign}
          showGame={query.game === undefined}
          showNames={showNames}
        />
      ))}
      {infinite && <div ref={ref} />}
      {isFetchingNextPage ? (
        <div className="m-8 flex justify-center">
          <LoadingIcon className="h-8 w-8" />
        </div>
      ) : null}
    </div>
  );
}
