import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { TimelapseExport } from "./TimelapseExport";
import { TimelineReadout } from "./TimelineReadout";
import { TimelineScrubber } from "./TimelineScrubber";
import { TimelineTransport } from "./TimelineTransport";
import { useTimelineController, useTimelineKeyboard } from "./useTimelineController";
import type { TimelineController } from "./useTimelineController";
import { useEu5MapMode, useSetEu5TimelineBarHeight } from "../store";
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
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  const onAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !open) setMounted(false);
  };
  return { mounted, state: open ? "open" : "closed", onAnimationEnd } as const;
}

/**
 * The campaign timeline as a bar along the bottom of the map. The track gets
 * the full map width, which is what a long campaign needs for a precise drag.
 * Only the political mode has a history, so the bar shows for that mode and
 * leaves with the others. The keyboard shortcuts stay live throughout: a
 * step from another mode returns the map to the political mode, and the bar
 * rises with it.
 */
export function TimelineBar() {
  const controller = useTimelineController();
  const mapMode = useEu5MapMode();
  const insets = useViewportInsets();
  useTimelineKeyboard(controller);

  const open = controller !== null && isHistoricalMapMode(mapMode);
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
          <TimelineScrubber controller={controller} />
        </div>

        <TimelapseExport controller={controller} />
      </div>

      <TimelineAnnouncer controller={controller} />
    </div>
  );
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
    const report = () => setHeight(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => {
      observer.disconnect();
      setHeight(0);
    };
  }, [barRef, mounted, open, setHeight]);
}
