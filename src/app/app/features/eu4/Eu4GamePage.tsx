import { Suspense } from "react";
import { FeedList } from "@/features/saves/FeedList";
import { Link } from "@/components/Link";
import { LoadingState } from "@/components/LoadingState";
import { ErrorCatcher, ErrorDisplay } from "@/features/errors";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import { startSaves } from "./startSaves";
import type { StartSave } from "./startSaves";

const ogImageStyle = { aspectRatio: `${ogImageSize.width} / ${ogImageSize.height}` };

/**
 * The 1444 start of one patch: its map preview with the patch number as the
 * only caption, so a row of these reads as a row of versions.
 */
function StartSaveTile({ save, priority }: { save: StartSave; priority: boolean }) {
  return (
    <Link
      to={`/eu4/saves/${save.saveId}`}
      variant="ghost"
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-400/50 bg-slate-50 shadow-md ring-offset-2 ring-offset-white transition-shadow outline-none hover:shadow-lg focus-visible:ring-2 focus-visible:ring-sky-600 dark:bg-slate-800 dark:ring-offset-slate-900"
    >
      <img
        className="w-full bg-slate-900 object-contain"
        style={ogImageStyle}
        alt={`political map at the 1444 start of patch ${save.patch}`}
        width={ogImageSize.width}
        height={ogImageSize.height}
        src={ogImageUrl(save.saveId)}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
      <span className="border-t border-gray-400/50 px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums group-hover:underline group-hover:underline-offset-4">
        {save.patch}
      </span>
    </Link>
  );
}

/** The EU4 hub shows one short page of the feed; the feed page has the rest. */
export const HUB_FEED_QUERY = { game: "eu4", pageSize: 8 } as const;

export const Eu4GamePage = () => {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-16 p-5 md:p-9">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
          Europa Universalis IV
        </h1>
        <p className="max-w-prose text-lg text-gray-700 dark:text-gray-300">
          Saves players shared, the 1444 start of every patch, and the{" "}
          <Link to="/eu4/achievements">achievement leaderboard</Link>.
        </p>
      </header>

      <section aria-labelledby="start-saves" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="start-saves" className="text-2xl font-bold tracking-tight">
            1444 by patch
          </h2>
          <p className="max-w-prose text-gray-700 dark:text-gray-300">
            How the world stood on 11 November 1444 in each patch. Open two to compare borders,
            development, and religion between versions.
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {startSaves.map((save, i) => (
            <li key={save.patch}>
              <StartSaveTile save={save} priority={i < 5} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-saves" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="recent-saves" className="text-2xl font-bold tracking-tight">
            Recent saves
          </h2>
          <Link to="/saves?game=eu4">All EU4 saves</Link>
        </div>
        <Suspense fallback={<LoadingState />}>
          <ErrorCatcher
            fallback={(args) => (
              <ErrorDisplay {...args} className="m-8" title="Failed to load recent EU4 saves" />
            )}
          >
            <FeedList query={HUB_FEED_QUERY} infinite={false} />
          </ErrorCatcher>
        </Suspense>
      </section>
    </div>
  );
};
