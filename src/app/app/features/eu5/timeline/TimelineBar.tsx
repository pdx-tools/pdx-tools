import { useCampaign } from "@/features/campaign/CampaignProvider";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { sameFileVersion } from "@/features/campaign/types";
import type { CampaignSave } from "@/features/campaign/types";
import { SaveAnalysisGlyph } from "@/features/campaign/SaveAnalysisGlyph";
import { saveAnalysisPresentation } from "@/features/campaign/saveAnalysisPresentation";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";
import { useHistory } from "../history/store";
import { useMapHistory } from "../history/context";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { SavedDateExport, TimelapseExport } from "./TimelapseExport";
import { TimelineReadout } from "@/features/timeline/TimelineReadout";
import { TimelineScrubber } from "@/features/timeline/TimelineScrubber";
import { useTimelineCampaign } from "@/features/campaign/SaveMarks";
import { TimelineTransport } from "@/features/timeline/TimelineTransport";
import { useTimelineKeyboard } from "@/features/timeline/controller";
import type { TimelineController } from "@/features/timeline/controller";
import { useTimelineController } from "./useTimelineController";
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
  if (open && !mounted) setMounted(true);
  const onAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !open) setMounted(false);
  };
  return { mounted, state: open ? "open" : "closed", onAnimationEnd } as const;
}

/**
 * The campaign timeline as a bar along the bottom of the map. The track gets
 * the full map width, which is what a long campaign needs for a precise drag.
 * Political mode retains ownership history; other modes seek observed save dates
 * from the same compact analytical timeline.
 */
export function TimelineBar() {
  const pendingDates = useCampaign()?.pending ?? 0;
  const ownership = useTimelineController();
  const history = useMapHistory();
  const mapMode = useEu5MapMode();
  const controller = history?.controller ?? (isHistoricalMapMode(mapMode) ? ownership : null);
  const sources = useHistory((state) => state.sources);
  const failedSources = useHistory((state) => state.failedSources);
  const analyzingEntryIds = useHistory((state) => state.analyzingEntryIds);
  const analysisStatus = useCallback(
    (save: CampaignSave): SaveAnalysisStatus => {
      if (save.source.kind !== "local" || !save.source.entryId) return "pending";
      const source = sources[save.source.entryId];
      const entry = localSaveRegistry.get(save.source.entryId);
      const version = entry?.ref.kind === "file" ? entry.ref.file : entry?.version;
      if (
        !!source &&
        !!version &&
        sameFileVersion(version, source.version) &&
        !!history?.readyHashes.has(source.hash)
      )
        return "ready";
      if (analyzingEntryIds.includes(save.source.entryId)) return "analyzing";
      const failure = failedSources[save.source.entryId];
      if (entry?.problem && entry.problem.kind !== "moved") return "failed";
      if (
        failure &&
        (failure.version === null || (!!version && sameFileVersion(version, failure.version)))
      )
        return "failed";
      return "pending";
    },
    [sources, history?.readyHashes, analyzingEntryIds, failedSources],
  );
  const campaign = useTimelineCampaign(
    controller?.timeline.start,
    history?.enabled ? analysisStatus : undefined,
  );
  const speed = useHistory((state) => state.playbackSpeed);
  const insets = useViewportInsets();
  useTimelineKeyboard(controller);
  const open = controller !== null;
  const presence = usePresence(open);
  const barRef = useRef<HTMLDivElement>(null);
  useReportedHeight(barRef, open, presence.mounted);
  if (!presence.mounted || !controller) return null;
  return (
    <div
      ref={barRef}
      data-state={presence.state}
      onAnimationEnd={presence.onAnimationEnd}
      className={cx(styles.bar, "@container pointer-events-auto absolute z-20 font-game-ui")}
      style={{ left: insets.left + GUTTER_PX, right: insets.right + GUTTER_PX, bottom: GUTTER_PX }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel border border-game-line-strong bg-game-overlay py-2 pr-2 pl-2.5 shadow-xl backdrop-blur-md">
        <TimelineTransport controller={controller} />
        <TimelineReadout controller={controller} className="shrink-0" />
        <div className="min-w-0 flex-1 basis-64 @max-xl:order-first @max-xl:basis-full">
          <TimelineScrubber controller={controller} campaign={campaign} />
        </div>
        {history?.controller ? (
          <div className="flex shrink-0 items-center gap-2">
            <select
              aria-label="Saved-date playback speed"
              value={speed}
              className="rounded-control border border-game-line bg-game-panel px-1.5 py-1 font-game-num text-xs text-game-ink-300"
              onChange={(event) =>
                useHistory.getState().setPlaybackSpeed(Number(event.target.value))
              }
            >
              {[0.25, 0.5, 1, 2, 4, 8].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
            {history.frames > 0 && <SavedDateExport controller={controller} history={history} />}
          </div>
        ) : (
          <TimelapseExport controller={controller} />
        )}
        {history?.enabled && (
          <span
            className="flex flex-col gap-0.5 text-[10px] leading-tight text-game-ink-500"
            aria-label="Save analysis status"
          >
            {Object.entries(saveAnalysisPresentation).map(([status, { label }]) => (
              <span key={status}>
                <svg
                  aria-hidden
                  viewBox="0 0 10 13"
                  className="mr-1 inline-block h-3 w-2.5 overflow-visible"
                >
                  <SaveAnalysisGlyph status={status as SaveAnalysisStatus} />
                </svg>
                {label}
              </span>
            ))}
          </span>
        )}
      </div>
      {pendingDates > 0 && (
        <div
          role="status"
          className="mt-1 rounded-panel bg-game-panel px-3 py-2 text-xs text-game-ink-300"
        >
          Reading save dates… {pendingDates} remaining. New bookmarks will appear when reading
          finishes.
        </div>
      )}
      {history?.error && (
        <div
          role="status"
          className="mt-1 flex items-center gap-2 rounded-panel bg-game-panel px-3 py-2 text-xs text-game-ink-300"
        >
          <span>{history.error}</span>
          <button className="underline" onClick={history.retry}>
            Retry loading
          </button>
        </div>
      )}
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
