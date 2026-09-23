import { useId, useState } from "react";
import { cx } from "class-variance-authority";
import { ArrowRightIcon, CheckIcon, LinkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { Link } from "@/components/Link";
import { TimeAgo } from "@/components/TimeAgo";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { useSession } from "@/features/account";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { hasPermission } from "@/lib/auth";
import { formatInt } from "@/lib/format";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import { pdxApi } from "@/services/appApi";
import type { FeedCampaign, FeedContributor, FeedSave } from "@/server-lib/fn/feed";
import { DeleteSave } from "./DeleteSave";
import { SaveTile } from "./SaveTile";
import { formatGameDate } from "./gameDate";
import {
  DateLabel,
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
 * it; in a campaign, that is whichever save the filmstrip has selected.
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

/**
 * The saves of a campaign as a row of maps, oldest game date first. A frame
 * selects its save into the entry above it, so a reader can move through the
 * run and find the moment they want before they leave the feed. The strip
 * opens on its oldest frame: the furthest save is already large above it,
 * and a frame cut at the right edge shows that the row scrolls.
 *
 * The feed sends a sample of up to eight saves. A longer campaign offers the
 * rest on request; the entry holds that request, because the save it shows
 * can come from either list.
 */
function Filmstrip({
  campaign,
  saves,
  selected,
  onSelect,
  onShowAll,
  loading,
  failed,
}: {
  campaign: FeedCampaign;
  saves: readonly FeedSave[];
  selected: FeedSave;
  onSelect: (save: FeedSave) => void;
  /** Absent once every save is shown or on the way. */
  onShowAll: (() => void) | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const sampled = campaign.save_count > saves.length;
  const showUploader = campaign.contributors.length > 1;

  return (
    <section aria-label="Saves in this campaign" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 text-sm text-gray-600 dark:text-gray-400">
        <span className="tabular-nums">
          {sampled
            ? `${formatInt(saves.length)} of ${formatInt(campaign.save_count)} saves`
            : `${formatInt(saves.length)} saves`}
        </span>
        {sampled && onShowAll && (
          <button
            type="button"
            className="cursor-pointer rounded font-medium text-sky-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-sky-400"
            onClick={onShowAll}
          >
            Show all {formatInt(campaign.save_count)}
          </button>
        )}
        {loading && <LoadingIcon className="h-4 w-4 self-center" />}
        {failed && <span className="text-rose-700 dark:text-rose-400">Failed to load saves</span>}
      </div>

      <ol className="flex snap-x gap-3 overflow-x-auto pb-2">
        {saves.map((save) => {
          const isSelected = save.id === selected.id;
          const gameDate = formatGameDate(save.date);
          return (
            <li key={save.id} className="w-40 shrink-0 snap-start sm:w-52 lg:w-40">
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`Show the save from ${gameDate}`}
                onClick={() => onSelect(save)}
                className="group/frame flex w-full cursor-pointer flex-col gap-1.5 rounded text-left ring-offset-2 ring-offset-white outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:ring-offset-slate-900"
              >
                <img
                  className={cx(
                    "w-full rounded-sm border bg-slate-900 object-contain transition-colors",
                    isSelected
                      ? "border-sky-500 ring-2 ring-sky-500"
                      : "border-gray-400/50 group-hover/frame:border-sky-600",
                  )}
                  style={ogImageStyle}
                  alt=""
                  width={ogImageSize.width}
                  height={ogImageSize.height}
                  src={ogImageUrl(save.id, save.game)}
                  loading="lazy"
                />
                <span
                  className={cx(
                    "text-xs tabular-nums",
                    isSelected
                      ? "font-semibold text-gray-900 dark:text-white"
                      : "text-gray-600 dark:text-gray-400",
                  )}
                >
                  {gameDate}
                </span>
                {showUploader && (
                  <span className="truncate text-xs text-gray-600 dark:text-gray-400">
                    {save.user_name}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
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
      {furthest.game === "eu4" && furthest.achievements.length > 0 && (
        <AchievementRow ids={furthest.achievements} />
      )}
    </SaveTile>
  );
}

/** The most icons that fit one row of the narrowest tile. */
const TILE_ACHIEVEMENTS = 5;

/**
 * The achievements of a save in one row, so every tile keeps one height. A
 * save with more than fit shows the first ones and a count of the rest.
 */
function AchievementRow({ ids }: { ids: readonly number[] }) {
  const overflow = ids.length > TILE_ACHIEVEMENTS;
  const shown = overflow ? ids.slice(0, TILE_ACHIEVEMENTS - 1) : ids;
  const rest = ids.length - shown.length;
  return (
    <ul aria-label="Achievements" className="mt-2 flex gap-1.5">
      {shown.map((id) => (
        <li key={id}>
          <AchievementAvatar size={40} id={id} className="block" />
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
 * One campaign in the feed: its map on the left, and on the right what that
 * save is, in the order of a hub tile, with the saves of the run as a
 * filmstrip under it. The entry has no
 * visible title. The map is its face and carries the date, and the details
 * lead with who played. A heading for assistive technology names the entry. The entry opens on
 * the save that got the furthest, not on the newest upload, so a campaign
 * uploaded back to front still shows where it reached. A frame of the strip
 * selects another save into the map and the details.
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
  // A deleted save leaves the strip at once, and does not wait for the feed
  // to load again.
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const all = pdxApi.saves.useCampaign(campaign.game, campaign.key, showAll);
  const saves = (showAll && all.data ? oldestFirst(all.data.saves) : campaign.sample).filter(
    (x) => !deleted.has(x.id),
  );
  // The furthest save is the last frame. When the selected save is gone,
  // the entry goes back to the furthest save that is left.
  const selected = saves.find((x) => x.id === selectedId) ?? saves.at(-1) ?? campaign.furthest;

  const headingId = useId();
  const played = playedAs(selected);
  const gameDate = formatGameDate(selected.date);
  const title =
    showNames && campaign.furthest.game === "eu5" ? campaign.furthest.playthrough_name : undefined;

  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-x-6 gap-y-4 border-b border-gray-400/40 pb-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]"
    >
      <Link
        to={savePath(selected)}
        variant="ghost"
        className="group/map @container relative block self-start overflow-hidden rounded border border-gray-400/50 ring-offset-2 ring-offset-white outline-none hover:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-600 dark:ring-offset-slate-900"
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
        <DateLabel date={selected.date} />
        {showGame && <GameMark game={campaign.game} className="absolute top-2 left-2 shadow-md" />}
      </Link>

      <div className="flex min-w-0 flex-col gap-4">
        {title ? (
          <h2 id={headingId} className="min-w-0 truncate text-xl leading-tight font-semibold">
            {title}
          </h2>
        ) : (
          <h2 id={headingId} className="sr-only">
            {entryLabel(campaign, selected)}
          </h2>
        )}

        {/* The same order as a tile: who played and the patch, then the upload. */}
        <div className="flex min-w-0 flex-col gap-1.5 text-sm">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 text-base font-semibold">
              {played ? <PlayedAsValue played={played} /> : gameDate}
            </div>
            <span className="shrink-0 text-gray-600 dark:text-gray-400">
              <PatchValue save={selected} detailed />
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-x-1.5 text-gray-600 dark:text-gray-400">
            <Link to={`/users/${selected.user_id}`} className="min-w-0 truncate">
              {selected.user_name}
            </Link>
            <span aria-hidden className="text-gray-400">
              ·
            </span>
            <TimeAgo date={selected.upload_time} />
          </div>
          {showNames && (
            <div className="min-w-0 truncate text-gray-600 dark:text-gray-400">
              {selected.filename}
            </div>
          )}
          {campaign.save_count > 1 && (
            <div className="text-gray-600 tabular-nums dark:text-gray-400">
              Campaign {formatGameDate(campaign.first_date)} –{" "}
              {formatGameDate(campaign.latest_date)}
            </div>
          )}
        </div>

        {selected.game === "eu4" && selected.achievements.length > 0 && (
          <ul aria-label="Achievements" className="flex flex-wrap gap-1.5">
            {selected.achievements.map((x) => (
              <li key={x}>
                <AchievementAvatar size={40} id={x} className="block" />
              </li>
            ))}
          </ul>
        )}

        <SaveButtons
          save={selected}
          onDeleted={() => setDeleted((prev) => new Set(prev).add(selected.id))}
        />

        {campaign.save_count > 1 && (
          <Filmstrip
            campaign={campaign}
            saves={saves}
            selected={selected}
            onSelect={(save) => setSelectedId(save.id)}
            onShowAll={showAll ? undefined : () => setShowAll(true)}
            loading={showAll && !all.data && !all.error}
            failed={!!all.error}
          />
        )}
      </div>
    </article>
  );
}
