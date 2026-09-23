import { useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { cx } from "class-variance-authority";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { Input } from "@/components/Input";
import { Link } from "@/components/Link";
import { Tooltip } from "@/components/Tooltip";
import { difficultyNum, difficultyText } from "@/lib/difficulty";
import { formatInt } from "@/lib/format";
import { DISCORD_INVITE_URL } from "@/lib/links";
import type { Achievement } from "@/services/appApi";
import { findableRef, useFindableLabels } from "./useFindableLabels";

/** Folds case and accents, so "osterreich" finds "Österreich". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The ids of the achievements whose name or description holds the query.
 * With an empty query, the result is null: nothing is searched for.
 */
export function matchAchievements(achievements: Achievement[], query: string) {
  const needle = fold(query.trim());
  if (needle === "") {
    return null;
  }

  return new Set(
    achievements
      .filter((x) => fold(x.name).includes(needle) || fold(x.description).includes(needle))
      .map((x) => x.id),
  );
}

function matchStatus(matches: Set<Achievement["id"]>, total: number) {
  if (matches.size === 0) {
    return `None of ${formatInt(total)}`;
  }
  if (matches.size === 1) {
    return "1 match, Enter opens it";
  }
  return `${formatInt(matches.size)} of ${formatInt(total)}`;
}

/**
 * Searches the wall by name or by goal. The find in page of the browser
 * finds names only, as descriptions show only in tooltips. Enter opens the
 * leaderboard when one achievement matches, and Escape clears the query.
 */
export function AchievementSearch({
  value,
  onChange,
  matches,
  total,
}: {
  value: string;
  onChange: (value: string) => void;
  matches: Set<Achievement["id"]> | null;
  total: number;
}) {
  const navigate = useNavigate();

  return (
    // The status comes after the input for screen readers, but shows to its
    // left on wide screens, so the input keeps the edge of the wall.
    <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-row-reverse">
      <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
        />
        <Input
          type="search"
          aria-label="Search achievements"
          aria-describedby="achievement-search-status"
          placeholder="Search achievements"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && value !== "") {
              event.preventDefault();
              onChange("");
            } else if (event.key === "Enter" && matches?.size === 1) {
              const [id] = matches;
              navigate(`/eu4/achievements/${id}`);
            }
          }}
          className="h-9 w-full pr-2 pl-8 focus-visible:ring-sky-600 dark:ring-offset-slate-900"
        />
      </div>
      <p
        id="achievement-search-status"
        aria-live="polite"
        className="shrink-0 text-sm whitespace-nowrap text-gray-600 tabular-nums dark:text-gray-400"
      >
        {matches ? matchStatus(matches, total) : null}
      </p>
    </div>
  );
}

/**
 * A new GitHub issue with its title filled in, so requests are easy to find.
 * The body says that some achievements cannot be verified, before anyone
 * asks for one of them.
 */
function requestIssueUrl(name: string) {
  // encodeURIComponent writes a space as %20, which every form reads as a
  // space. URLSearchParams writes "+" instead.
  const title = encodeURIComponent(`Achievement request: ${name}`);
  const body = encodeURIComponent(
    "Some achievements depend on things a save does not record, so not every achievement can get a leaderboard.\n\nAchievement: ",
  );
  return `https://github.com/pdx-tools/pdx-tools/issues/new?title=${title}&body=${body}`;
}

/**
 * Where to ask for a leaderboard that does not exist. With a `query` that
 * found nothing, it names the query; without one, it is a quiet line under
 * the wall.
 */
export function AchievementRequest({ query }: { query?: string }) {
  const links = (
    <>
      Request it on <Link href={DISCORD_INVITE_URL}>Discord</Link> or{" "}
      <Link href={requestIssueUrl(query ?? "")}>GitHub</Link>.
    </>
  );

  if (query) {
    return (
      <p className="text-gray-700 dark:text-gray-300">
        No leaderboard matches “{query}”. {links}
      </p>
    );
  }

  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">Missing an achievement? {links}</p>
  );
}

/**
 * Every recognized achievement as its own icon, grouped by difficulty and
 * ordered from the easiest band to the hardest. A player recognizes these
 * icons from the game, so the wall is faster to search by eye than a table
 * of names, and it fits a run's worth of targets in one screen.
 */
export function AchievementWall({
  achievements,
  matches = null,
}: {
  achievements: Achievement[];
  /** The ids that match a search. Others fade, but keep their place. */
  matches?: Set<Achievement["id"]> | null;
}) {
  const wall = useRef<HTMLDivElement>(null);
  useFindableLabels(wall);
  const bands = useMemo(() => {
    const byDifficulty = new Map<Achievement["difficulty"], Achievement[]>();
    for (const achievement of achievements) {
      const key = achievement.difficulty;
      const band = byDifficulty.get(key);
      if (band) {
        band.push(achievement);
      } else {
        byDifficulty.set(key, [achievement]);
      }
    }

    return [...byDifficulty.entries()]
      .map(([difficulty, list]) => ({
        difficulty,
        list: [...list].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => difficultyNum(a.difficulty) - difficultyNum(b.difficulty));
  }, [achievements]);

  return (
    <Tooltip.Provider delayDuration={120}>
      <div ref={wall} className="flex flex-col gap-7">
        {bands.map((band) => (
          <section key={band.difficulty} className="flex flex-col gap-3">
            <h3 className="flex items-baseline gap-2 font-mono text-xs tracking-[0.12em] text-gray-600 uppercase dark:text-gray-400">
              {difficultyText(band.difficulty)}
              <span className="text-gray-500 tabular-nums dark:text-gray-500">
                {matches
                  ? `${formatInt(band.list.filter((x) => matches.has(x.id)).length)} of ${formatInt(band.list.length)}`
                  : formatInt(band.list.length)}
              </span>
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {band.list.map((achievement) => (
                <li key={achievement.id}>
                  <Tooltip>
                    {/* The tooltip trigger names this as its description only while the
                        tooltip is open. This holds the description at all times, so a
                        screen reader reads it on the link. */}
                    <Tooltip.Trigger
                      asChild
                      aria-describedby={`achievement-${achievement.id}-goal`}
                    >
                      <AchievementAvatar
                        id={achievement.id}
                        name={achievement.name}
                        size={40}
                        className={cx(
                          "relative block rounded-sm ring-sky-600 ring-offset-2 ring-offset-white transition-[transform,opacity,filter] outline-none hover:scale-110 focus-visible:ring-2 has-[[data-find-label]:not([hidden])]:ring-2 dark:ring-offset-slate-900",
                          matches &&
                            (matches.has(achievement.id)
                              ? "ring-2"
                              : "opacity-25 grayscale hover:opacity-100 hover:grayscale-0 focus-visible:opacity-100 focus-visible:grayscale-0"),
                        )}
                      >
                        {/* The label has no box of its own, so it takes no space while
                            hidden. The icon's alt text already names the link. */}
                        <span
                          ref={findableRef}
                          data-find-label
                          hidden
                          aria-hidden
                          className="pointer-events-none absolute top-full left-1/2 z-10 -translate-x-1/2"
                        >
                          <span className="mt-2 block w-max max-w-40 rounded-sm bg-slate-900 px-2 py-1 text-center text-xs leading-snug font-medium text-white shadow-md dark:bg-slate-100 dark:text-slate-900">
                            {achievement.name}
                          </span>
                        </span>
                      </AchievementAvatar>
                    </Tooltip.Trigger>
                    <span id={`achievement-${achievement.id}-goal`} hidden>
                      {achievement.description}
                    </span>
                    <Tooltip.Content className="max-w-72">
                      <div className="font-semibold">{achievement.name}</div>
                      <div className="mt-1 text-sm opacity-80">{achievement.description}</div>
                    </Tooltip.Content>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Tooltip.Provider>
  );
}
