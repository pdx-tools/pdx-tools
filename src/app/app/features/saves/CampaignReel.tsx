import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { IconButton } from "@/components/IconButton";
import { Link } from "@/components/Link";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { formatInt } from "@/lib/format";
import { ogImageSize, ogImageUrl } from "@/lib/media";
import type { FeedCampaign, FeedSave } from "@/server-lib/fn/feed";
import { formatGameDate } from "./gameDate";
import { positionToStop, rulerEnds, rulerStops, stopToPosition } from "./reelRuler";
import { GameMark, savePath } from "./saveDetails";

const ogImageStyle = { aspectRatio: `${ogImageSize.width} / ${ogImageSize.height}` };

/** A pointer must move this far before a press on the map is a drag, not a click. */
const DRAG_THRESHOLD = 4;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The saves of a campaign as one map that the reader scrubs through. The
 * frames are stacked in place, and a horizontal scroll over the map moves
 * from one save to the next with a crossfade. Because the map does not move,
 * the eye stays on one place and sees the borders change. A trackpad, a
 * swipe, a shift and wheel, or a mouse drag scrubs the map.
 *
 * The ruler under the map puts each save at its game date, so that the gaps
 * in the run are visible. The ruler is also a slider: a drag on it or the
 * arrow keys scrub the map.
 *
 * A click on the map opens the save that shows. The reel tells its parent
 * which save shows, and moves to the `selected` save when the list changes
 * (when the reader shows all saves or deletes one).
 *
 * The feed sends a sample of up to eight saves. A longer campaign offers the
 * rest on request; the entry holds that request.
 */
export function CampaignReel({
  campaign,
  saves,
  selected,
  onSelect,
  onShowAll,
  loading,
  failed,
  showGame,
  className,
}: {
  campaign: FeedCampaign;
  saves: readonly FeedSave[];
  selected: FeedSave;
  onSelect: (save: FeedSave) => void;
  /** Absent once every save is shown or on the way. */
  onShowAll: (() => void) | undefined;
  loading: boolean;
  failed: boolean;
  showGame: boolean;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    saves.findIndex((x) => x.id === selected.id),
  );
  const [position, setPosition] = useState(selectedIndex);
  const last = saves.length - 1;
  const stops = useMemo(() => rulerStops(saves.map((x) => x.date)), [saves]);
  const [firstLabel, lastLabel] = rulerEnds(saves[0].date, saves[last].date, formatGameDate);

  const lo = Math.min(Math.floor(position), last);
  const fraction = position - lo;
  const shown = Math.min(Math.round(position), last);

  // A drag on the map or on the ruler turns snap off until the pointer is up,
  // then glides to the nearest frame.
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
    from: "map" | "ruler";
  } | null>(null);
  const [dragging, setDragging] = useState<"map" | "ruler" | null>(null);

  // Frames load when the reader comes near them, and stay loaded after.
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set());
  const near = saves.slice(Math.max(0, lo - 1), lo + 3).map((x) => x.id);
  if (near.some((id) => !visited.has(id))) {
    setVisited((prev) => new Set([...prev, ...near]));
  }

  // Keep the scroll on the selected save when the list changes under it:
  // when the reader shows all saves, or deletes one. Only the list moves the
  // reel. A change to the selection comes from the reel itself, and a scroll
  // back to it would pull against a glide that has already moved on.
  const scrollToSelected = useEffectEvent(() => {
    const el = scrollerRef.current;
    if (!el || dragRef.current) {
      return;
    }
    if (Math.round(el.scrollLeft / el.clientWidth) !== selectedIndex) {
      el.scrollLeft = selectedIndex * el.clientWidth;
      setPosition(selectedIndex);
    }
  });
  useLayoutEffect(() => {
    scrollToSelected();
  }, [saves]);

  // A resize keeps the frame that shows.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width && width > 0) {
        el.scrollLeft = Math.round(el.scrollLeft / width) * el.clientWidth;
      }
      width = el.clientWidth;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The scroll sets the position, and tells the parent which save shows,
  // so that the details follow the map.
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) {
      return;
    }
    const next = Math.min(Math.max(el.scrollLeft / el.clientWidth, 0), last);
    setPosition(next);
    const save = saves[Math.round(next)];
    if (save && save.id !== selected.id) {
      onSelect(save);
    }
  };

  /** Moves the reel to a frame. A glide, unless the reader prefers less motion. */
  const goTo = (index: number) => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const target = Math.min(Math.max(index, 0), last);
    el.scrollTo({
      left: target * el.clientWidth,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  /** Puts the reel at a position at once, with snap off, for a drag. */
  const scrubTo = (to: number) => {
    const el = scrollerRef.current;
    if (el) {
      el.scrollLeft = Math.min(Math.max(to, 0), last) * el.clientWidth;
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragging(null);
    const el = scrollerRef.current;
    if (el && drag.moved) {
      goTo(Math.round(el.scrollLeft / el.clientWidth));
    }
  };

  const onMapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Touch and pen scroll the reel without help. A mouse has no sideways
    // scroll, so a mouse drag does it.
    if (e.pointerType !== "mouse" || e.button !== 0 || !scrollerRef.current) {
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: scrollerRef.current.scrollLeft,
      moved: false,
      from: "map",
    };
  };

  const onMapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || drag.from !== "map" || drag.pointerId !== e.pointerId || !el) {
      return;
    }
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) {
      return;
    }
    if (!drag.moved) {
      // The capture sends the click to the reel, not to the link of a frame,
      // so a drag does not open a save.
      drag.moved = true;
      el.setPointerCapture(e.pointerId);
      setDragging("map");
    }
    el.scrollLeft = drag.startScroll - dx;
  };

  const rulerPointToPosition = (clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return position;
    }
    const stop = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return stopToPosition(stops, stop);
  };

  const onRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !scrollerRef.current) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: scrollerRef.current.scrollLeft,
      moved: true,
      from: "ruler",
    };
    setDragging("ruler");
    scrubTo(rulerPointToPosition(e.clientX));
  };

  const onRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.from === "ruler" && drag.pointerId === e.pointerId) {
      scrubTo(rulerPointToPosition(e.clientX));
    }
  };

  const onRulerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: shown - 1,
      ArrowDown: shown - 1,
      ArrowRight: shown + 1,
      ArrowUp: shown + 1,
      PageDown: shown - 5,
      PageUp: shown + 5,
      Home: 0,
      End: last,
    };
    const to = step[e.key];
    if (to !== undefined) {
      e.preventDefault();
      goTo(to);
    }
  };

  const sampled = campaign.save_count > saves.length;
  const playhead = positionToStop(stops, position);
  const shownDate = formatGameDate(saves[shown].date);

  return (
    <section
      aria-label="Saves in this campaign"
      className={cx("flex min-w-0 flex-col gap-3", className)}
    >
      <div
        className={cx(
          "@container relative overflow-hidden rounded border bg-slate-900 transition-colors",
          dragging === "map" ? "border-sky-600" : "border-gray-400/50 hover:border-sky-600",
        )}
        style={ogImageStyle}
      >
        {saves.map((save, i) => {
          const opacity = i === lo ? 1 : i === lo + 1 ? fraction : 0;
          return (
            visited.has(save.id) && (
              <img
                key={save.id}
                className="absolute inset-0 h-full w-full object-contain"
                style={{ opacity, visibility: opacity === 0 ? "hidden" : undefined }}
                alt={i === shown ? `Map on ${shownDate}` : ""}
                width={ogImageSize.width}
                height={ogImageSize.height}
                src={ogImageUrl(save.id, save.game)}
                loading="lazy"
                draggable={false}
              />
            )
          );
        })}

        {/* The scroll that drives the crossfade. Its frames are empty links
            over the stacked maps: a click opens the save that shows. */}
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          onPointerDown={onMapPointerDown}
          onPointerMove={onMapPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cx(
            "absolute inset-0 flex [scrollbar-width:none] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden",
            dragging ? "cursor-grabbing snap-none" : "snap-x snap-mandatory",
          )}
        >
          {saves.map((save) => (
            <Link
              key={save.id}
              to={savePath(save)}
              variant="ghost"
              tabIndex={-1}
              aria-hidden
              draggable={false}
              className="h-full w-full shrink-0 snap-start"
            />
          ))}
        </div>

        <div className="pointer-events-none absolute inset-0">
          {showGame && (
            <GameMark game={campaign.game} className="absolute top-2 left-2 shadow-md" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 gap-y-1.5">
        <IconButton
          variant="ghost"
          shape="square"
          className="text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white"
          onClick={() => goTo(shown - 1)}
          disabled={shown === 0}
          aria-label="Earlier save"
          icon={<ChevronLeftIcon className="h-4 w-4" aria-hidden />}
        />

        <div
          ref={rulerRef}
          role="slider"
          tabIndex={0}
          aria-label="Save in this campaign"
          aria-valuemin={1}
          aria-valuemax={saves.length}
          aria-valuenow={shown + 1}
          aria-valuetext={`${shownDate}, save ${shown + 1} of ${saves.length}`}
          onPointerDown={onRulerPointerDown}
          onPointerMove={onRulerPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onRulerKeyDown}
          className={cx(
            "relative mx-2 h-8 flex-1 touch-none rounded-sm ring-offset-2 ring-offset-white outline-none select-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:ring-offset-slate-900",
            dragging === "ruler" ? "cursor-grabbing" : "cursor-pointer",
          )}
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px bg-gray-400/70 dark:bg-gray-600"
          />
          <div
            aria-hidden
            className="absolute top-1/2 left-0 h-px bg-sky-600 dark:bg-sky-500"
            style={{ width: `${playhead * 100}%` }}
          />
          {stops.map((stop, i) => (
            <span
              key={saves[i].id}
              aria-hidden
              className={cx(
                "absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2",
                i === shown
                  ? "h-4 bg-sky-600 dark:bg-sky-500"
                  : i < shown
                    ? "h-2.5 bg-sky-600/70 dark:bg-sky-500/70"
                    : "h-2.5 bg-gray-500 dark:bg-gray-500",
              )}
              style={{ left: `${stop * 100}%` }}
            />
          ))}
          <span
            aria-hidden
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow-sm dark:border-slate-900 dark:bg-sky-500"
            style={{ left: `${playhead * 100}%` }}
          />
        </div>

        <IconButton
          variant="ghost"
          shape="square"
          className="text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white"
          onClick={() => goTo(shown + 1)}
          disabled={shown === last}
          aria-label="Later save"
          icon={<ChevronRightIcon className="h-4 w-4" aria-hidden />}
        />

        {/* The years at the ends of the ruler, and the count between them. */}
        <div className="col-start-2 mx-2 flex items-baseline justify-between gap-x-3 text-xs text-gray-600 tabular-nums dark:text-gray-400">
          <span>{firstLabel}</span>
          <span className="flex items-baseline gap-x-3">
            <span>
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
            {loading && <LoadingIcon className="h-3.5 w-3.5 self-center" />}
            {failed && (
              <span className="text-rose-700 dark:text-rose-400">Failed to load saves</span>
            )}
          </span>
          <span>{lastLabel}</span>
        </div>
      </div>
    </section>
  );
}
