import { Suspense } from "react";
import { LoadingState } from "@/components/LoadingState";
import { ErrorCatcher, ErrorDisplay } from "@/features/errors";
import type { FeedGame } from "@/server-lib/fn/feed";
import { FeedList } from "./FeedList";
import { SavesHeader } from "./SavesNav";

export function SavesFeedPage({ game }: { game: FeedGame | undefined }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-5 md:p-9">
      <SavesHeader title="Shared saves" path="/saves" game={game} />
      <Suspense fallback={<LoadingState />}>
        <ErrorCatcher
          fallback={(args) => (
            <ErrorDisplay {...args} className="m-8" title="Failed to load shared saves" />
          )}
        >
          <FeedList key={game ?? "all"} query={{ game }} />
        </ErrorCatcher>
      </Suspense>
    </div>
  );
}
