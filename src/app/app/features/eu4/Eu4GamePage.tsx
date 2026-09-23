import { Suspense } from "react";
import { FeedList } from "@/features/saves/FeedList";
import { Link } from "@/components/Link";
import { LoadingState } from "@/components/LoadingState";
import { ErrorCatcher, ErrorDisplay } from "@/features/errors";
import { HubHeader } from "@/features/games/HubHeader";
import { AchievementWall } from "./components/AchievementWall";
import { PodiumFinishes } from "./components/PodiumFinishes";
import { startSaves } from "./startSaves";
import { formatInt } from "@/lib/format";
import type { Achievement } from "@/services/appApi";
import type { PodiumFinish } from "@/server-lib/fn/achievement";

/** The EU4 hub shows the newest campaigns; the feed page has the rest. */
export const HUB_FEED_QUERY = { game: "eu4", pageSize: 3 } as const;

/** How many of the newest podium finishes the hub shows. */
export const PODIUM_LIMIT = 5;

/**
 * The 1444 start of one patch. Borders barely move between versions, so a
 * row of map previews would read as one map nine times; the patch number is
 * the whole of what tells these saves apart.
 */
function StartSaveChip({ patch, saveId }: { patch: string; saveId: string }) {
  return (
    <Link
      to={`/eu4/saves/${saveId}`}
      variant="ghost"
      className="inline-flex h-8 items-center rounded-sm border border-gray-400/60 px-3 font-mono text-sm font-semibold tabular-nums ring-offset-2 ring-offset-white transition-colors outline-none hover:border-sky-600 hover:bg-sky-600 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-gray-600 dark:ring-offset-slate-900"
    >
      {patch}
    </Link>
  );
}

export const Eu4GamePage = ({
  achievements,
  podium,
}: {
  achievements: Achievement[];
  /** Null when the podium failed to load. */
  podium: PodiumFinish[] | null;
}) => {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-16 p-5 md:p-9">
      <HubHeader title="Europa Universalis IV" />

      {/* No section is better than an empty one: the wall below leads to every leaderboard. */}
      {podium && podium.length > 0 && (
        <section aria-labelledby="podium" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="podium" className="text-2xl font-bold tracking-tight">
              Recent podium finishes
            </h2>
            <p className="max-w-prose text-gray-700 dark:text-gray-300">
              The newest runs to hold a top-three place on an achievement leaderboard. Places are
              live: a faster run or a new patch can take a medal away.
            </p>
          </div>
          <PodiumFinishes finishes={podium} />
        </section>
      )}

      <section aria-labelledby="achievements" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="achievements" className="text-2xl font-bold tracking-tight">
            Achievements
          </h2>
          <p className="max-w-prose text-gray-700 dark:text-gray-300">
            {formatInt(achievements.length)} achievements have a speedrun leaderboard, ranked by
            in-game days and taxed 10% for every patch a run is behind the latest. Open one to see
            who holds it.
          </p>
        </div>
        <AchievementWall achievements={achievements} />
      </section>

      <section aria-labelledby="start-saves" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="start-saves" className="text-2xl font-bold tracking-tight">
            The starting world across patches
          </h2>
        </div>
        <ul className="flex flex-wrap gap-2">
          {startSaves.map((save) => (
            <li key={save.patch}>
              <StartSaveChip patch={save.patch} saveId={save.saveId} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-saves" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="recent-saves" className="text-2xl font-bold tracking-tight">
            Recent uploads
          </h2>
          <Link to="/saves?game=eu4">All EU4 campaigns</Link>
        </div>
        <Suspense fallback={<LoadingState />}>
          <ErrorCatcher
            fallback={(args) => (
              <ErrorDisplay {...args} className="m-8" title="Failed to load recent EU4 saves" />
            )}
          >
            <FeedList query={HUB_FEED_QUERY} infinite={false} compact />
          </ErrorCatcher>
        </Suspense>
      </section>
    </div>
  );
};
