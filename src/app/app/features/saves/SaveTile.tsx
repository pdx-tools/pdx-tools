import { cx } from "class-variance-authority";
import { Link } from "@/components/Link";
import { TimeAgo } from "@/components/TimeAgo";
import { formatGameDate } from "./gameDate";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import type { FeedSave } from "@/server-lib/fn/feed";
import { DateLabel, PlayedAsValue, PatchValue, playedAs, savePath } from "./saveDetails";

const ogImageStyle = { aspectRatio: `${ogImageSize.width} / ${ogImageSize.height}` };

/**
 * One save as a feed entry at a smaller size: the map with its date on top,
 * then who played with the patch beside it, and who uploaded it. `children` adds lines
 * under these, such as the medals of a podium finish.
 */
export function SaveTile({
  save,
  label,
  children,
}: {
  save: FeedSave;
  /** A name for the tile from game data, for assistive technology. */
  label: string;
  children?: React.ReactNode;
}) {
  const path = savePath(save);
  const played = playedAs(save);

  return (
    <article aria-label={label} className="flex min-w-0 flex-col gap-3">
      {/* The name below is the same link, so the map leaves the tab order. */}
      <Link
        to={path}
        variant="ghost"
        tabIndex={-1}
        aria-hidden
        className="@container relative block overflow-hidden rounded border border-gray-400/50 transition-colors hover:border-sky-600"
      >
        <img
          className="w-full bg-slate-900 object-contain"
          style={ogImageStyle}
          alt=""
          width={ogImageSize.width}
          height={ogImageSize.height}
          src={ogImageUrl(save.id, save.game)}
          loading="lazy"
        />
        <DateLabel date={save.date} />
      </Link>

      <div className="flex min-w-0 flex-col gap-1 text-sm">
        {/* The name truncates before the patch does. */}
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h3 className="min-w-0 text-base leading-tight font-semibold">
            <Link
              to={path}
              variant="ghost"
              className="inline-flex max-w-full rounded-sm underline-offset-4 ring-offset-2 ring-offset-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-600 dark:ring-offset-slate-900"
            >
              {played ? <PlayedAsValue played={played} /> : formatGameDate(save.date)}
            </Link>
          </h3>
          <span className="shrink-0 text-gray-600 dark:text-gray-400">
            <PatchValue save={save} />
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-1.5 text-gray-600 dark:text-gray-400">
          <Link to={`/users/${save.user_id}`} className="min-w-0 truncate">
            {save.user_name}
          </Link>
          <span aria-hidden className="text-gray-400">
            ·
          </span>
          <TimeAgo date={save.upload_time} />
        </div>
        {children}
      </div>
    </article>
  );
}

/**
 * Tiles in a grid of up to three columns. On a narrow screen they form one
 * row that scrolls sideways, as the frames of a campaign do in the feed.
 */
export function SaveTileList({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cx(
        "-mx-5 flex snap-x scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function SaveTileItem({ children }: { children: React.ReactNode }) {
  return <li className="w-64 shrink-0 snap-start sm:w-auto">{children}</li>;
}
