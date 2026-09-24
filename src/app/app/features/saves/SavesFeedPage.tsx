import { Suspense } from "react";
import { cx } from "class-variance-authority";
import { Link } from "@/components/Link";
import { LoadingState } from "@/components/LoadingState";
import { ErrorCatcher, ErrorDisplay } from "@/features/errors";
import type { FeedGame } from "@/server-lib/fn/feed";
import { FeedList } from "./FeedList";

const FILTERS: { game: FeedGame | undefined; label: string; to: string }[] = [
  { game: undefined, label: "All", to: "/saves" },
  { game: "eu4", label: "EU4", to: "/saves?game=eu4" },
  { game: "eu5", label: "EU5", to: "/saves?game=eu5" },
];

function GameFilter({ game }: { game: FeedGame | undefined }) {
  return (
    <nav
      aria-label="Game"
      className="flex w-fit gap-0.5 rounded-md bg-gray-200 p-0.5 dark:bg-slate-700"
    >
      {FILTERS.map((filter) => {
        const active = filter.game === game;
        return (
          <Link
            key={filter.label}
            to={filter.to}
            variant="ghost"
            replace
            preventScrollReset
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded px-3 py-1 text-sm font-medium outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-sky-600",
              active
                ? "bg-white text-black shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-gray-700 hover:bg-gray-300/60 dark:text-gray-300 dark:hover:bg-slate-600",
            )}
          >
            {filter.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SavesFeedPage({ game }: { game: FeedGame | undefined }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-5 md:p-9">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
          Shared saves
        </h1>
        <p className="max-w-prose text-lg text-gray-700 dark:text-gray-300">
          Campaigns players shared, most recent upload first. Every save of a run sits under one
          entry, however many times and by whomever it was uploaded.
        </p>
        <GameFilter game={game} />
      </header>
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
