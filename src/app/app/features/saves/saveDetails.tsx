import { UserGroupIcon } from "@heroicons/react/24/outline";
import { cx } from "class-variance-authority";
import { Flag } from "@/features/eu4/components/avatars";
import { Eu5Flag } from "@/features/eu5/components/flags/Eu5Flag";
import { difficultyText } from "@/lib/difficulty";
import { formatInt } from "@/lib/format";
import { Tooltip } from "@/components/Tooltip";
import type { FeedSave } from "@/server-lib/fn/feed";

/*
 * The facts of one shared save as the feed shows them, for its entries and
 * for the tiles of a game hub.
 */

export function savePath(save: FeedSave) {
  return `/${save.game}/saves/${save.id}`;
}

/**
 * Who played the save, from the game's own data. The feed never leads with
 * a name that a player typed (a playthrough name or a file name).
 */
type PlayedAs =
  | { kind: "country"; tag: string; name: string }
  | { kind: "eu5-country"; flag: string; name: string }
  | { kind: "players"; count: number }
  | { kind: "observer" };

export function playedAs(save: FeedSave): PlayedAs | undefined {
  if (save.game === "eu4") {
    return save.players > 1
      ? { kind: "players", count: save.players }
      : { kind: "country", tag: save.player_tag, name: save.player_tag_name ?? save.player_tag };
  }

  if (save.players.length === 0) {
    return { kind: "observer" };
  }
  if (save.players.length > 1) {
    return { kind: "players", count: save.players.length };
  }

  // A save uploaded before the country was recorded has no tag.
  if (save.player_tag === null) {
    return undefined;
  }
  return {
    kind: "eu5-country",
    flag: save.player_flag ?? save.player_tag,
    name: save.player_country_name ?? save.player_tag,
  };
}

export function playedAsText(played: PlayedAs | undefined): string | undefined {
  switch (played?.kind) {
    case "country":
    case "eu5-country":
      return played.name;
    case "players":
      return `${formatInt(played.count)} players`;
    case "observer":
      return "Observer";
    default:
      return undefined;
  }
}

export function PlayedAsValue({ played }: { played: PlayedAs }) {
  if (played.kind === "country") {
    return (
      <Flag tag={played.tag} name={played.name}>
        <span className="flex min-w-0 items-center gap-2">
          <Flag.Image size="xs" />
          <Flag.CountryName className="truncate" />
        </span>
      </Flag>
    );
  }

  if (played.kind === "eu5-country") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Eu5Flag flag={played.flag} size="sm" />
        <span className="truncate">{played.name}</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <UserGroupIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden />
      {playedAsText(played)}
    </span>
  );
}

/**
 * The date as text, laid over the date that the preview image carries. At
 * the size the feed shows a preview, the image's own date is too small to
 * read.
 *
 * The screenshot renderer (`pdx-map/src/layers/date_layer.rs`) draws that
 * date flush with the bottom-left corner, 174 × 54 px on the 1200 × 630
 * image: 14.5% of the width and 8.57% of the height. This label covers at
 * least that area on an opaque ground, so none of the image's date shows
 * through. If the renderer changes the size of its label, change these
 * values too.
 */
export function DateLabel({ date }: { date: string }) {
  return (
    <span
      aria-hidden
      className="absolute bottom-0 left-0 flex min-h-[8.58%] min-w-[14.5%] items-center bg-black px-[1.6cqw] font-mono text-[clamp(0.75rem,1.9cqw,1.0625rem)] leading-none text-white tabular-nums"
    >
      {date}
    </span>
  );
}

function fullPatch(save: FeedSave): string {
  return save.game === "eu5"
    ? `${save.version_major}.${save.version_minor}.${save.version_patch}`
    : save.patch;
}

/** The patch as `major.minor`, the unit that leaderboards tax. */
function shortPatch(save: FeedSave): string {
  if (save.game === "eu5") {
    return `${save.version_major}.${save.version_minor}`;
  }
  return save.patch.split(".").slice(0, 2).join(".");
}

/**
 * Difficulty colors with at least 4.5:1 contrast on the light and the dark
 * ground. The word carries the difficulty, so the color is never its only
 * sign: red and green are the pair that color-blind readers confuse most.
 */
const tileDifficultyColor = {
  VeryEasy: "text-emerald-700 dark:text-emerald-400",
  Easy: "text-emerald-700 dark:text-emerald-400",
  Hard: "text-rose-700 dark:text-rose-400",
  VeryHard: "text-rose-700 dark:text-rose-400",
} as const;

/**
 * The patch in short: `1.35`. A difficulty other than Normal follows in its
 * color, as `1.35 · Hard`. Normal is the default, so it is not written. With
 * `detailed`, a tooltip on the number gives the full patch.
 */
export function PatchValue({ save, detailed = false }: { save: FeedSave; detailed?: boolean }) {
  const difficulty =
    save.game === "eu4" && save.game_difficulty !== "Normal" ? save.game_difficulty : undefined;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="sr-only">Patch </span>
      {detailed ? (
        <Tooltip>
          <Tooltip.Trigger className="cursor-default underline decoration-gray-400 decoration-dotted underline-offset-4">
            {shortPatch(save)}
          </Tooltip.Trigger>
          <Tooltip.Content>Patch {fullPatch(save)}</Tooltip.Content>
        </Tooltip>
      ) : (
        shortPatch(save)
      )}
      {difficulty && (
        <>
          <span aria-hidden className="mx-1.5 text-gray-400">
            ·
          </span>
          <span className={tileDifficultyColor[difficulty]}>{difficultyText(difficulty)}</span>
        </>
      )}
    </span>
  );
}

/** The game of a save, as a small mark on its map. */
export function GameMark({ game, className }: { game: FeedSave["game"]; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center rounded border border-gray-400/70 bg-gray-100 px-1.5 font-mono text-[11px] font-semibold tracking-wide text-gray-700 uppercase dark:border-gray-600 dark:bg-slate-700 dark:text-gray-200",
        className,
      )}
    >
      {game === "eu5" ? "EU5" : "EU4"}
    </span>
  );
}
