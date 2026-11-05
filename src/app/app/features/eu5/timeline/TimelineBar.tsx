import { useCampaign } from "@/features/campaign/CampaignProvider";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { sameFileVersion } from "@/features/campaign/types";
import type { CampaignSave } from "@/features/campaign/types";
import { SaveAnalysisGlyph } from "@/features/campaign/SaveAnalysisGlyph";
import { saveAnalysisPresentation } from "@/features/campaign/saveAnalysisPresentation";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";
import { useHistory } from "../history/store";
import { useMapHistory } from "../history/context";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import ChevronDownIcon from "@heroicons/react/20/solid/ChevronDownIcon";
import ChevronUpIcon from "@heroicons/react/20/solid/ChevronUpIcon";
import PauseIcon from "@heroicons/react/24/solid/PauseIcon";
import PlayIcon from "@heroicons/react/24/solid/PlayIcon";
import { focusRing } from "@/components/game/focusRing";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { SavedDateExport, TimelapseExport } from "./TimelapseExport";
import { TimelineReadout } from "@/features/timeline/TimelineReadout";
import { TimelineScrubber } from "@/features/timeline/TimelineScrubber";
import { useTimelineCampaign } from "@/features/campaign/SaveMarks";
import { TimelineTransport } from "@/features/timeline/TimelineTransport";
import { useTimelineKeyboard } from "@/features/timeline/controller";
import type { TimelineController } from "@/features/timeline/controller";
import { useTimelineController } from "./useTimelineController";
import {
  useEu5Engine,
  useEu5Input,
  useEu5MapMode,
  useEu5SelectionState,
  useSetEu5TimelineBarHeight,
} from "../store";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { landChapters } from "../stack/selection";
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
 * Political mode retains ownership history. Other modes hold the bar at the
 * save date and say why, so that the campaign keeps one place on the screen.
 */
export function TimelineBar() {
  const navigation = useCampaign();
  const pendingDates = navigation?.pending ?? 0;
  const input = useEu5Input();
  const hasLocalSaves =
    input.kind !== "server" ||
    navigation?.saves.some((save) => save.source.kind === "local" && save.source.entryId);
  const ownership = useTimelineController();
  const history = useMapHistory();
  const mapMode = useEu5MapMode();
  const engine = useEu5Engine();
  // The bar stays in each mode. A mode with no history holds it at the save date, and says so.
  const frozen = !history?.controller && !isHistoricalMapMode(mapMode);
  const baseController = history?.controller ?? ownership;
  // The selected country's own beats stand on the track with the world's events.
  const selection = useEu5SelectionState();
  const selectedCountry =
    selection?.preset !== "players" && selection?.activeProfile?.kind === "country"
      ? selection.activeProfile.country
      : null;
  const countryKey = selectedCountry?.key ?? null;
  const { data: land } = useEu5Trigger(
    (e) =>
      countryKey === null ? Promise.resolve(undefined) : e.queries.getLandHistory(countryKey),
    [countryKey],
  );
  const beats = useMemo(
    () =>
      land && selectedCountry
        ? landChapters(land).map((chapter) => ({
            key: `beat:${chapter.year}`,
            label: `${selectedCountry.name}: ${chapter.text}`,
            date: { year: chapter.year, month: 1, day: 1 },
          }))
        : [],
    [land, selectedCountry],
  );
  const controller = useMemo(() => {
    if (!baseController) return baseController;
    const end = baseController.timeline.end;
    return {
      ...baseController,
      locked: baseController.locked || frozen,
      timeline: {
        ...baseController.timeline,
        notes: [
          ...baseController.timeline.notes,
          ...beats.map((beat) => (beat.date.year >= end.year ? { ...beat, date: end } : beat)),
        ],
      },
    };
  }, [baseController, frozen, beats]);
  const phone = !useBreakpoint("md");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const sources = useHistory((state) => state.sources);
  const failedSources = useHistory((state) => state.failedSources);
  const analyzingEntryIds = useHistory((state) => state.analyzingEntryIds);
  const analysisStatus = useCallback(
    (save: CampaignSave): SaveAnalysisStatus | undefined => {
      if (save.source.kind !== "local" || !save.source.entryId) return undefined;
      // Analysis never includes a save of another campaign, so it never waits for one.
      if (save.membership === "different") return undefined;
      const source = sources[save.source.entryId];
      const entry = localSaveRegistry.get(save.source.entryId);
      const version = entry?.ref.kind === "file" ? entry.ref.file : entry?.version;
      if (
        !!source &&
        !!version &&
        sameFileVersion(version, source.version) &&
        !!history?.readyIds.has(source.snapshotId)
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
    [sources, history?.readyIds, analyzingEntryIds, failedSources],
  );
  const campaign = useTimelineCampaign(
    controller?.timeline.start,
    history?.enabled ? analysisStatus : undefined,
  );
  const speed = useHistory((state) => state.playbackSpeed);
  const insets = useViewportInsets();
  useTimelineKeyboard(frozen ? null : controller);
  // A phone has little map, so a frozen bar gives its room back.
  const open = controller !== null && !(phone && frozen);
  const presence = usePresence(open);
  const barRef = useRef<HTMLDivElement>(null);
  useReportedHeight(barRef, open, presence.mounted);
  if (!presence.mounted || !controller) return null;
  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Campaign timeline"
      data-state={presence.state}
      onAnimationEnd={presence.onAnimationEnd}
      className={cx(styles.bar, "@container pointer-events-auto absolute z-20 font-game-ui")}
      style={{
        left: insets.left + (phone ? 6 : GUTTER_PX),
        right: insets.right + (phone ? 6 : GUTTER_PX),
        bottom: insets.bottom + (phone ? 6 : GUTTER_PX),
      }}
    >
      {phone && !phoneOpen ? (
        // One row on a phone, so the map keeps its height and a tap on the map stays on the map.
        <div className="flex h-11 items-center gap-2 rounded-panel border border-game-line-strong bg-game-overlay pr-1 pl-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            aria-label={controller.playing ? "Pause" : "Play"}
            onClick={controller.togglePlayback}
            className={cx(
              "grid h-11 w-11 shrink-0 place-items-center rounded-control text-game-ink-100",
              focusRing,
            )}
          >
            {controller.playing ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="h-5 w-5" />
            )}
          </button>
          <TimelineReadout controller={controller} className="shrink-0" />
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setPhoneOpen(true)}
            className={cx(
              "ml-auto flex h-11 shrink-0 items-center gap-1 rounded-control px-2 font-game-ui text-[12px] text-game-ink-300",
              focusRing,
            )}
          >
            Timeline
            <ChevronUpIcon aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel border border-game-line-strong bg-game-overlay py-2 pr-2 pl-2.5 shadow-xl backdrop-blur-md">
          <TimelineTransport controller={controller} />
          <TimelineReadout controller={controller} className="shrink-0" />
          <div
            className={cx(
              "min-w-0 flex-1 basis-64 @max-xl:order-first @max-xl:basis-full",
              frozen && "opacity-50",
            )}
          >
            <TimelineScrubber controller={controller} campaign={campaign} />
          </div>
          {frozen ? (
            <span className="flex shrink-0 flex-col items-start gap-0.5 font-game-ui text-[12px] leading-tight text-game-ink-300">
              <span>Only borders replay on the map. Yearly totals are in the charts.</span>
              <button
                type="button"
                onClick={() => void engine.trigger.selectMapMode("political")}
                className={cx(
                  "cursor-pointer text-game-ink-100 underline decoration-game-ink-rule underline-offset-2 hover:decoration-game-ink-100",
                  focusRing,
                )}
              >
                Back to Political
              </button>
            </span>
          ) : (
            <span
              aria-label="Timeline key"
              className="flex shrink-0 flex-col gap-0.5 font-game-ui text-[12px] leading-tight text-game-ink-500 @max-3xl:hidden"
            >
              <span className="flex items-center gap-1 whitespace-nowrap">
                <span aria-hidden className="h-2.5 w-1 bg-game-accent-500" />
                Land changing hands
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-game-ink-300" aria-hidden>
                  <path d="M5 0.5 L9.5 5 L5 9.5 L0.5 5 Z" fill="currentColor" />
                </svg>
                World events
              </span>
            </span>
          )}
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
          ) : frozen ? null : (
            <TimelapseExport controller={controller} />
          )}
          {history?.enabled && hasLocalSaves && (
            <span
              className="flex flex-col gap-0.5 text-[12px] leading-tight text-game-ink-500"
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
          {phone ? (
            <button
              type="button"
              aria-expanded
              aria-label="Close the timeline"
              onClick={() => setPhoneOpen(false)}
              className={cx(
                "grid h-11 w-11 shrink-0 place-items-center rounded-control text-game-ink-300",
                focusRing,
              )}
            >
              <ChevronDownIcon aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      )}
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
