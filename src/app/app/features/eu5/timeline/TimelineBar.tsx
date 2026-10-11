import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import { useSnapshotTimelineController } from "../history/useSnapshotTimelineController";
import { useHistory } from "../history/store";
import { GameButton } from "@/components/game/Button";
import { TimelapseExport } from "./TimelapseExport";
import { TimelineReadout } from "@/features/timeline/TimelineReadout";
import { TimelineScrubber } from "@/features/timeline/TimelineScrubber";
import { useTimelineCampaign } from "@/features/campaign/SaveMarks";
import { TimelineTransport } from "@/features/timeline/TimelineTransport";
import { useTimelineKeyboard } from "@/features/timeline/controller";
import type { TimelineController } from "@/features/timeline/controller";
import { useTimelineController } from "./useTimelineController";
import { useEu5MapMode, useSetEu5TimelineBarHeight, useSetEu5InsightPanelOpen } from "../store";
import { isHistoricalMapMode } from "../ui-engine";
import { useViewportInsets } from "../useViewportInsets";
import styles from "./TimelineBar.module.css";

/** Space kept between the bar and the map edges and the panels that flank it. */
const GUTTER_PX = 16;

/**
 * Keeps an element mounted through its exit animation. `state` drives the
 * CSS; the element unmounts when its own `animationend` fires while closed.
 */
function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const onAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !open) setMounted(false);
  };
  return { mounted, state: open ? "open" : "closed", onAnimationEnd } as const;
}

/**
 * The campaign timeline as a bar along the bottom of the map. The track gets
 * the full map width, which is what a long campaign needs for a precise drag.
 * Political mode uses ownership history. Other modes use the same control
 * to seek and play through saved observations.
 */
export function TimelineBar() {
  const ownership = useTimelineController();
  const snapshots = useSnapshotTimelineController();
  const controller = snapshots ?? ownership;
  const campaign = useTimelineCampaign(controller?.timeline.start);
  const mapMode = useEu5MapMode();
  const insets = useViewportInsets();
  const saveNavigation = useCampaign();
  const savedDates = snapshots !== null;
  const setPanelOpen = useSetEu5InsightPanelOpen();
  const speed = useHistory((state) => state.playbackSpeed);
  useTimelineKeyboard(savedDates || isHistoricalMapMode(mapMode) ? controller : null);

  const open = controller !== null && (savedDates || isHistoricalMapMode(mapMode));
  const presence = usePresence(open);
  const barRef = useRef<HTMLDivElement>(null);
  useReportedHeight(barRef, open, presence.mounted);

  if (controller === null || !presence.mounted) return null;

  return (
    <div
      ref={barRef}
      data-state={presence.state}
      onAnimationEnd={presence.onAnimationEnd}
      className={cx(styles.bar, "@container pointer-events-auto absolute z-20 font-game-ui")}
      style={{
        left: insets.left + GUTTER_PX,
        right: insets.right + GUTTER_PX,
        bottom: GUTTER_PX,
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel border border-game-line-strong bg-game-overlay py-2 pr-2 pl-2.5 shadow-xl backdrop-blur-md">
        <TimelineTransport controller={controller} />

        <TimelineReadout controller={controller} className="shrink-0" />

        {/* A narrow bar gives the track its own full row on top. */}
        <div className="min-w-0 flex-1 basis-64 @max-xl:order-first @max-xl:basis-full">
          <TimelineScrubber controller={controller} campaign={campaign} />
        </div>

        {savedDates ? (
          <select
            aria-label="Saved-date playback speed"
            className="rounded-control border border-game-line bg-game-panel px-1.5 py-1 font-game-num text-xs text-game-ink-300"
            value={speed}
            onChange={(event) => useHistory.getState().setPlaybackSpeed(Number(event.target.value))}
          >
            {[0.25, 0.5, 1, 2, 4, 8].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        ) : (
          <TimelapseExport controller={controller} />
        )}
        {saveNavigation && (
          <GameButton
            variant="ghost"
            onClick={() => {
              useHistory.getState().showPanel(true);
              setPanelOpen(true);
            }}
          >
            Over time
          </GameButton>
        )}
      </div>

      <TimelineAnnouncer controller={controller} />
      <PlaybackFailures />
    </div>
  );
}

function PlaybackFailures() {
  const failed = useHistory((state) => state.failedSaves);
  const count = Object.keys(failed).length;
  return count ? (
    <p
      role="status"
      className="mt-1 text-xs text-game-ink-500"
      title={Object.values(failed).join("\n")}
    >
      {count} unavailable saves skipped during playback.
    </p>
  ) : null;
}

/**
 * Tells assistive tech what playback did on its own. The playhead's arrival
 * at the save date is visible on the track; this is the same moment, spoken.
 */
function TimelineAnnouncer({ controller }: { controller: TimelineController }) {
  const message =
    controller.playback === "ended" ? "Reached the save date. Play again to replay." : "";
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

/**
 * The bar's measured height, published to the store so the overlays that
 * share the bottom edge can stand clear of it. Reports zero as soon as the
 * bar starts to leave, so those overlays settle together with it.
 */
function useReportedHeight(
  barRef: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  mounted: boolean,
) {
  const setHeight = useSetEu5TimelineBarHeight();

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!mounted || !open || !el) {
      setHeight(0);
      return;
    }
    // ResizeObserver provides the border box after layout. Reading offsetHeight in
    // this effect forced a synchronous layout on every save's new store.
    const observer = new ResizeObserver(([entry]) => {
      setHeight(Math.round(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight));
    });
    observer.observe(el, { box: "border-box" });
    return () => observer.disconnect();
  }, [barRef, mounted, open, setHeight]);
}
