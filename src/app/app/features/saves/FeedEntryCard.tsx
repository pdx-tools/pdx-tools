import { useId, useState } from "react";
import { cx } from "class-variance-authority";
import { ArrowRightIcon, CheckIcon, LinkIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { Link } from "@/components/Link";
import { TimeAgo } from "@/components/TimeAgo";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { AchievementAvatar, Flag } from "@/features/eu4/components/avatars";
import { Eu5Flag } from "@/features/eu5/components/flags/Eu5Flag";
import { GameMark } from "@/features/account/CampaignList";
import { useCopyLink } from "@/features/account/SaveActions";
import { eu5Version, formatGameDate } from "@/features/account/campaigns";
import { difficultyColor, difficultyText } from "@/lib/difficulty";
import { formatInt } from "@/lib/format";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import { pdxApi } from "@/services/appApi";
import type { FeedCampaign, FeedContributor, FeedSave } from "@/server-lib/fn/feed";

const ogImageStyle = { aspectRatio: `${ogImageSize.width} / ${ogImageSize.height}` };

function savePath(save: FeedSave) {
  return `/${save.game}/saves/${save.id}`;
}

/**
 * `1444-11-11` (EU4) or `1444.11.11` (EU5) as `1444-11-11`, digits only, as
 * the preview image writes its date.
 */
function numericGameDate(date: string): string {
  const [y, m, d] = date.split(/[.-]/);
  if (!y || !m || !d) return date;
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** `1444-11-11` (EU4) or `1444.11.11` (EU5) as a sortable number. */
function gameDateOrdinal(date: string): number {
  const [y = 0, m = 0, d = 0] = date.split(/[.-]/).map(Number);
  return y * 10000 + m * 100 + d;
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

function playedAs(save: FeedSave): PlayedAs | undefined {
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

function playedAsText(played: PlayedAs | undefined): string | undefined {
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

function PlayedAsValue({ played }: { played: PlayedAs }) {
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

function VersionValue({ save }: { save: FeedSave }) {
  if (save.game === "eu5") {
    return <span className="tabular-nums">{eu5Version(save)}</span>;
  }

  return (
    <span>
      <span className="tabular-nums">{save.patch}</span>{" "}
      <span className={difficultyColor(save.game_difficulty)}>
        ({difficultyText(save.game_difficulty)})
      </span>
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
function DateLabel({ date }: { date: string }) {
  return (
    <span
      aria-hidden
      className="absolute bottom-0 left-0 flex min-h-[8.58%] min-w-[14.5%] items-center bg-black px-[1.6cqw] font-mono text-[clamp(0.75rem,1.9cqw,1.0625rem)] leading-none text-white tabular-nums"
    >
      {date}
    </span>
  );
}

/** Open and copy take one treatment, because they are the two equal ways to follow a save. */
function SaveButtons({ save }: { save: FeedSave }) {
  const path = savePath(save);
  const { copied, copy } = useCopyLink(path);
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="default" className="gap-2 py-1.5 text-sm hover:no-underline">
        <Link variant="ghost" to={path}>
          Open save
          <ArrowRightIcon className="h-4 w-4" aria-hidden />
        </Link>
      </Button>
      <Button variant="default" className="gap-2 py-1.5 text-sm" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
        {copied ? (
          <CheckIcon className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden />
        ) : (
          <LinkIcon className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-600 dark:text-gray-400">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">{children}</dd>
    </>
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
 * rest on request.
 */
function Filmstrip({
  campaign,
  selected,
  onSelect,
}: {
  campaign: FeedCampaign;
  selected: FeedSave;
  onSelect: (save: FeedSave) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { data, error } = pdxApi.saves.useCampaign(campaign.game, campaign.key, showAll);

  const saves =
    showAll && data
      ? [...data.saves].sort(
          (a, b) =>
            gameDateOrdinal(a.date) - gameDateOrdinal(b.date) ||
            a.upload_time.localeCompare(b.upload_time),
        )
      : campaign.sample;
  const sampled = campaign.save_count > saves.length;
  const showUploader = campaign.contributors.length > 1;

  return (
    <section
      aria-label="Saves in this campaign"
      className="flex min-w-0 flex-col gap-2 lg:col-span-2"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 text-sm text-gray-600 dark:text-gray-400">
        <span className="tabular-nums">
          {sampled
            ? `${formatInt(saves.length)} of ${formatInt(campaign.save_count)} saves`
            : `${formatInt(saves.length)} saves`}
        </span>
        {sampled && !showAll && (
          <button
            type="button"
            className="cursor-pointer rounded font-medium text-sky-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-sky-400"
            onClick={() => setShowAll(true)}
          >
            Show all {formatInt(campaign.save_count)}
          </button>
        )}
        {showAll && !data && !error && <LoadingIcon className="h-4 w-4 self-center" />}
        {error && <span className="text-rose-700 dark:text-rose-400">Failed to load saves</span>}
      </div>

      <ol className="flex snap-x gap-3 overflow-x-auto pb-2">
        {saves.map((save) => {
          const isSelected = save.id === selected.id;
          const gameDate = formatGameDate(save.date);
          return (
            <li key={save.id} className="w-40 shrink-0 snap-start sm:w-52">
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

/** The uploaders as text, for a row that is already a link of its own. */
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
 * One campaign as a single row: the map it reached, who played it, and its
 * date. A game hub uses these to point at the feed without becoming one, so
 * the row carries no filmstrip and no actions.
 */
export function FeedEntryRow({ campaign }: { campaign: FeedCampaign }) {
  const { furthest } = campaign;
  const who = playedAsText(playedAs(furthest));
  return (
    <article aria-label={entryLabel(campaign)}>
      <Link
        to={savePath(furthest)}
        variant="ghost"
        className="group flex items-center gap-4 rounded border-b border-gray-400/40 py-3 ring-offset-2 ring-offset-white outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:ring-offset-slate-900"
      >
        <img
          className="w-24 shrink-0 rounded-sm border border-gray-400/50 bg-slate-900 object-contain transition-colors group-hover:border-sky-600 sm:w-32 md:w-40"
          style={ogImageStyle}
          alt=""
          width={ogImageSize.width}
          height={ogImageSize.height}
          src={ogImageUrl(furthest.id, furthest.game)}
          loading="lazy"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate leading-tight font-semibold group-hover:underline group-hover:underline-offset-4">
            {who ?? formatGameDate(furthest.date)}
          </h3>
          <div className="text-sm text-gray-600 tabular-nums dark:text-gray-400">
            {who && formatGameDate(furthest.date)}
            {who && campaign.save_count > 1 && <span className="mx-1.5 text-gray-400">·</span>}
            {campaign.save_count > 1 && `${formatInt(campaign.save_count)} saves`}
          </div>
          <div className="truncate text-sm text-gray-600 dark:text-gray-400">
            by {contributorNames(campaign.contributors)}
          </div>
        </div>
      </Link>
    </article>
  );
}

/**
 * One campaign in the feed: its map on the left, what that save is on the
 * right, and the saves of the run as a filmstrip beneath. The entry has no
 * visible title. The map is its face and carries the date, and the details
 * lead with who played. A heading for assistive technology names the entry. The entry opens on
 * the save that got the furthest, not on the newest upload, so a campaign
 * uploaded back to front still shows where it reached. A frame of the strip
 * selects another save into the map and the details.
 *
 * `showGame` marks the map with its game, for a feed that mixes games.
 */
export function FeedEntryCard({
  campaign,
  showGame,
}: {
  campaign: FeedCampaign;
  showGame: boolean;
}) {
  const [selected, setSelected] = useState<FeedSave>(campaign.furthest);
  const headingId = useId();
  const played = playedAs(selected);
  const gameDate = formatGameDate(selected.date);

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
        <DateLabel date={numericGameDate(selected.date)} />
        {showGame && <GameMark game={campaign.game} className="absolute top-2 left-2 shadow-md" />}
      </Link>

      <div className="flex min-w-0 flex-col gap-4">
        <h2 id={headingId} className="sr-only">
          {entryLabel(campaign, selected)}
        </h2>

        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {played && (
            <Detail label="Played as">
              <PlayedAsValue played={played} />
            </Detail>
          )}
          <Detail label="Version">
            <VersionValue save={selected} />
          </Detail>
          {campaign.save_count > 1 && (
            <Detail label="Campaign">
              <span className="tabular-nums">
                {formatGameDate(campaign.first_date)} – {formatGameDate(campaign.latest_date)}
              </span>
            </Detail>
          )}
          <Detail label="Uploaded">
            <Link to={`/users/${selected.user_id}`}>{selected.user_name}</Link>
            <span className="text-gray-400">·</span>
            <TimeAgo date={selected.upload_time} />
          </Detail>
          {selected.game === "eu4" && selected.achievements.length > 0 && (
            <Detail label="Achievements">
              <span role="group" aria-label="Achievements" className="flex flex-wrap gap-1.5">
                {selected.achievements.map((x) => (
                  <AchievementAvatar key={x} size={40} id={x} />
                ))}
              </span>
            </Detail>
          )}
        </dl>

        <SaveButtons save={selected} />
      </div>

      {campaign.save_count > 1 && (
        <Filmstrip campaign={campaign} selected={selected} onSelect={setSelected} />
      )}
    </article>
  );
}
