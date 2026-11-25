import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { GameButton } from "@/components/game";
import { useCampaignTimeline } from "@/features/campaign/CampaignProvider";
import { clusterSaves } from "@/features/campaign/SaveMarks";
import { daysBetween } from "@/features/timeline/date";
import type { TimelineController } from "@/features/timeline/controller";
import { latestText, useShownWatch } from "@/features/keptSaves/WatchControl";
import type { WatchView } from "@/features/keptSaves/useWatchFollow";

/** The space that the label needs after the history of the open save, in px. */
const LABEL_SPACE = 150;

type Box = { top: number; right: number; width: number };
const isSameBox = (a: Box | null, b: Box) =>
  a?.top === b.top && a.right === b.right && a.width === b.width;

/** The place of the track in the bar. */
function useTrackBox(bar: HTMLElement | null, track: HTMLElement | null): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (!bar || !track) return;
    const measure = () => {
      const outer = bar.getBoundingClientRect();
      const { top, right, width } = track.getBoundingClientRect();
      const next = { top: top - outer.top, right: outer.right - right, width };
      setBox((current) => (isSameBox(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(track);
    return () => observer.disconnect();
  }, [bar, track]);
  return track && box;
}

/**
 * Open the newest save from the end of the track. The label is above the bar
 * when the end has no bookmark of that save alone, or no space for the label.
 * It is one element in both places, so it keeps the focus.
 */
export function LatestSave({
  bar,
  track = null,
  timeline,
}: {
  bar: HTMLElement | null;
  track?: HTMLElement | null;
  timeline?: TimelineController;
}) {
  const view = useShownWatch();
  const saves = useCampaignTimeline()?.saves;
  const box = useTrackBox(bar, track);
  if (view === null || view.latest === null) return null;
  const { key } = view.latest.save;
  const last = saves?.at(-1);
  let onTrack: Box | null = null;
  if (box && timeline && saves && last?.key === key) {
    const { start } = timeline.timeline;
    const days = daysBetween(start, last.date);
    const px = (day: number) => (day / days) * box.width;
    const end = clusterSaves(saves, start, px).at(-1);
    const hasSpace = box.width - px(timeline.totalDays) >= LABEL_SPACE;
    if (hasSpace && end?.saves.length === 1) onTrack = box;
  }
  return (
    <LatestButton
      view={view}
      className={
        onTrack ? undefined : timeline ? "right-0 bottom-full mb-1.5" : "bottom-full left-0 mb-1.5"
      }
      style={onTrack ? { top: onTrack.top, right: onTrack.right } : undefined}
    />
  );
}

function LatestButton({
  view,
  className,
  style,
}: {
  view: WatchView;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // The label goes when its save opens. The list of saves beside it takes the focus.
  useLayoutEffect(() => {
    const button = ref.current;
    return () => {
      if (button === null || document.activeElement !== button) return;
      button.parentElement?.querySelector<HTMLElement>("[data-save-list]")?.focus();
    };
  }, []);
  const { loading, failed } = view;
  const text = latestText(view);
  return (
    <GameButton
      ref={ref}
      onClick={() => {
        if (loading === null) view.openLatest();
      }}
      aria-disabled={loading !== null || undefined}
      aria-label={failed ? `Try again, ${text}` : undefined}
      className={cx(
        "absolute z-20 h-6! bg-game-panel-2! px-2! text-xs whitespace-nowrap aria-disabled:opacity-60",
        failed && "text-game-warn!",
        className,
      )}
      style={style}
    >
      {failed ? (
        "Try again"
      ) : (
        <>
          {loading?.key === view.latest?.save.key ? "Loading" : "Latest"}{" "}
          <span className="font-game-num tabular-nums">{text}</span>
        </>
      )}
    </GameButton>
  );
}
