import { useId, useState } from "react";
import { ArrowRightIcon, CheckIcon, LinkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { Link } from "@/components/Link";
import { TimeAgo } from "@/components/TimeAgo";
import { useSession } from "@/features/account";
import { AchievementAvatar, hasAchievementIcon } from "@/features/eu4/components/avatars";
import { hasPermission } from "@/lib/auth";
import { formatInt } from "@/lib/format";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import { pdxApi } from "@/services/appApi";
import type { FeedCampaign, FeedContributor, FeedSave } from "@/server-lib/fn/feed";
import { CampaignReel } from "./CampaignReel";
import { DeleteSave } from "./DeleteSave";
import { SaveTile } from "./SaveTile";
import { formatGameDate } from "./gameDate";
import {
  GameMark,
  PlayedAsValue,
  PatchValue,
  playedAs,
  playedAsText,
  savePath,
} from "./saveDetails";
import { useCopyLink } from "./useCopyLink";

const ogImageStyle = { aspectRatio: `${ogImageSize.width} / ${ogImageSize.height}` };

/**
 * Open the save, or copy its link. The uploader got a link to share when
 * they uploaded, so a reader of the feed rarely needs one: copy is the small
 * second control. The uploader of the save, and an admin, can also delete
 * it; in a campaign, that is whichever save the reel shows.
 */
function SaveButtons({ save, onDeleted }: { save: FeedSave; onDeleted: () => void }) {
  const path = savePath(save);
  const { copied, copy } = useCopyLink(path);
  const session = useSession();
  const canDelete = hasPermission(session, "savefile:delete", { userId: save.user_id });
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="default" className="gap-2 py-1.5 text-sm hover:no-underline">
        <Link variant="ghost" to={path}>
          Open save
          <ArrowRightIcon className="h-4 w-4" aria-hidden />
        </Link>
      </Button>
      <IconButton
        variant="ghost"
        shape="square"
        className="text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white"
        onClick={copy}
        aria-label={copied ? "Link copied" : "Copy link"}
        tooltip={copied ? "Copied" : "Copy link"}
        icon={
          copied ? (
            <CheckIcon className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden />
          ) : (
            <LinkIcon className="h-4 w-4" aria-hidden />
          )
        }
      />
      {canDelete && (
        <DeleteSave
          saveId={save.id}
          game={save.game}
          label={formatGameDate(save.date)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

/** The uploaders as text: "A", "A and B", or "A, B and C". */
function contributorNames(contributors: readonly FeedContributor[]): string {
  const names = contributors.map((x) => x.user_name);
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** A name for the entry from game data only, for assistive technology. */
function entryLabel(campaign: FeedCampaign, save: FeedSave = campaign.furthest) {
  const who = playedAsText(playedAs(save));
  const date = formatGameDate(save.date);
  return who ? `${who}, ${date}` : date;
}

/**
 * One campaign as a tile: the save that got the furthest, in the form of a
 * feed entry at a smaller size. A game hub uses these to point at the feed
 * without becoming one, so the tile carries no filmstrip and no actions.
 */
export function FeedEntryTile({ campaign }: { campaign: FeedCampaign }) {
  const { furthest } = campaign;
  const others = campaign.contributors.length > 1;
  return (
    <SaveTile save={furthest} label={entryLabel(campaign)}>
      {(campaign.save_count > 1 || others) && (
        <div className="text-gray-600 tabular-nums dark:text-gray-400">
          {campaign.save_count > 1 && `${formatInt(campaign.save_count)} saves`}
          {campaign.save_count > 1 && others && <span className="mx-1.5 text-gray-400">·</span>}
          {others && `by ${contributorNames(campaign.contributors)}`}
        </div>
      )}
      {furthest.game === "eu4" && <AchievementRow achievements={furthest.achievements} />}
    </SaveTile>
  );
}

/** The most icons that fit one row of the narrowest tile. */
const TILE_ACHIEVEMENTS = 5;

type FeedAchievement = Extract<FeedSave, { game: "eu4" }>["achievements"][number];

/** The achievements that have an icon. The others would show nothing. */
const withIcons = (achievements: readonly FeedAchievement[]) =>
  achievements.filter((x) => hasAchievementIcon(x.id));

/**
 * The achievements of a save in one row, so every tile keeps one height. A
 * save with more than fit shows the first ones and a count of the rest.
 */
function AchievementRow({ achievements }: { achievements: readonly FeedAchievement[] }) {
  const icons = withIcons(achievements);
  if (icons.length === 0) {
    return null;
  }

  const overflow = icons.length > TILE_ACHIEVEMENTS;
  const shown = overflow ? icons.slice(0, TILE_ACHIEVEMENTS - 1) : icons;
  const rest = icons.length - shown.length;
  return (
    <ul aria-label="Achievements" className="mt-2 flex gap-1.5">
      {shown.map((x) => (
        <li key={x.id}>
          <AchievementAvatar size={40} id={x.id} name={x.name} className="block" />
        </li>
      ))}
      {overflow && (
        <li
          aria-label={`and ${formatInt(rest)} more`}
          className="flex h-10 w-10 items-center justify-center rounded-sm border border-gray-400/60 text-sm font-semibold text-gray-700 tabular-nums dark:border-gray-600 dark:text-gray-300"
        >
          +{formatInt(rest)}
        </li>
      )}
    </ul>
  );
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The saves oldest game date first, and in upload order within a date. */
function oldestFirst(saves: readonly FeedSave[]): FeedSave[] {
  return [...saves].sort(
    (a, b) => compareText(a.date, b.date) || a.upload_time.localeCompare(b.upload_time),
  );
}

/**
 * One campaign in the feed: a header with what the save is, in the order of
 * a hub tile, and the map under it at the full width of the feed. The
 * details lead with who played, and a heading for assistive technology
 * names the entry. The entry opens on the save that got the furthest, not
 * on the newest upload, so a campaign uploaded back to front still shows
 * where it reached. A single save and a campaign have one layout. A
 * campaign shows its map as a reel, with a ruler under it: the reader
 * scrubs through the run, and the header follows the save that shows.
 *
 * `showGame` marks the map with its game, for a feed that mixes games.
 * `showNames` adds the names a player typed: the EU5 campaign name as a
 * visible title, and the file name of the save. A player's own page shows
 * them; the shared feed does not lead with them.
 */
export function FeedEntryCard({
  campaign,
  showGame,
  showNames = false,
}: {
  campaign: FeedCampaign;
  showGame: boolean;
  showNames?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(campaign.furthest.id);
  const [showAll, setShowAll] = useState(false);
  // A deleted save leaves the reel at once, and does not wait for the feed
  // to load again.
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const all = pdxApi.saves.useCampaign({
    game: campaign.game,
    key: campaign.key,
    enabled: showAll,
  });
  const saves = (showAll && all.data ? oldestFirst(all.data.saves) : campaign.sample).filter(
    (x) => !deleted.has(x.id),
  );
  // The furthest save is the last frame. When the selected save is gone,
  // the entry goes back to the furthest save that is left.
  const selected = saves.find((x) => x.id === selectedId) ?? saves.at(-1) ?? campaign.furthest;

  const headingId = useId();
  const played = playedAs(selected);
  const achievements = selected.game === "eu4" ? withIcons(selected.achievements) : [];
  const gameDate = formatGameDate(selected.date);
  const title =
    showNames && campaign.furthest.game === "eu5" ? campaign.furthest.playthrough_name : undefined;

  // With every save shown deleted, the entry goes too. If the campaign has
  // more saves, the feed brings the entry back when it loads again.
  if (saves.length === 0) {
    return null;
  }

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-4 border-b border-gray-400/40 pb-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {title ? (
            <h2 id={headingId} className="min-w-0 truncate text-xl leading-tight font-semibold">
              {title}
            </h2>
          ) : (
            <h2 id={headingId} className="sr-only">
              {entryLabel(campaign, selected)}
            </h2>
          )}

          {/* Who played, on which date and patch, then the upload. The image carries
              the date too, but too small to read on a narrow screen. */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <div className="min-w-0 text-lg leading-tight font-semibold">
              {played ? <PlayedAsValue played={played} /> : gameDate}
            </div>
            {played && (
              <span className="text-lg leading-tight text-gray-700 tabular-nums dark:text-gray-300">
                {gameDate}
              </span>
            )}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              <PatchValue save={selected} detailed />
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-x-1.5 text-sm text-gray-600 dark:text-gray-400">
            <Link to={`/users/${selected.user_id}`} className="min-w-0 truncate">
              {selected.user_name}
            </Link>
            <span aria-hidden className="text-gray-400">
              ·
            </span>
            <TimeAgo date={selected.upload_time} />
            {showNames && (
              <>
                <span aria-hidden className="text-gray-400">
                  ·
                </span>
                <span className="min-w-0 truncate">{selected.filename}</span>
              </>
            )}
          </div>

          {achievements.length > 0 && (
            <ul aria-label="Achievements" className="mt-2 flex flex-wrap gap-1.5">
              {achievements.map((x) => (
                <li key={x.id}>
                  <AchievementAvatar size={40} id={x.id} name={x.name} className="block" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <SaveButtons
          save={selected}
          onDeleted={() => setDeleted((prev) => new Set(prev).add(selected.id))}
        />
      </header>

      {campaign.save_count > 1 ? (
        <CampaignReel
          campaign={campaign}
          saves={saves}
          selected={selected}
          onSelect={(save) => setSelectedId(save.id)}
          onShowAll={showAll ? undefined : () => setShowAll(true)}
          loading={showAll && !all.data && !all.error}
          failed={!!all.error}
          showGame={showGame}
        />
      ) : (
        <Link
          to={savePath(selected)}
          variant="ghost"
          className="group/map @container relative block overflow-hidden rounded border border-gray-400/50 ring-offset-2 ring-offset-white outline-none hover:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-600 dark:ring-offset-slate-900"
        >
          <img
            className="w-full bg-slate-900 object-contain"
            style={ogImageStyle}
            alt={`Map on ${gameDate}`}
            width={ogImageSize.width}
            height={ogImageSize.height}
            src={ogImageUrl(selected.id, selected.game)}
            loading="lazy"
          />
          {showGame && (
            <GameMark game={campaign.game} className="absolute top-2 left-2 shadow-md" />
          )}
        </Link>
      )}
    </article>
  );
}
