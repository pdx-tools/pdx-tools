import { useCallback, useMemo } from "react";
import {
  useEu5Engine,
  useEu5Timelapse,
  useEu5Timeline,
  useEu5TimelineDate,
  useEu5TimelineLive,
  useEu5TimelineMapDate,
  useEu5TimelinePlayback,
} from "../store";
import type { TimelineStepUnit } from "../ui-engine";
import { addDays, daysBetween } from "@/features/timeline/date";
import type { TimelineController } from "@/features/timeline/controller";
import type { Eu5DateComponents } from "@/wasm/wasm_eu5";

/**
 * One view of the campaign timeline for a control to render. Returns `null`
 * when the save has no ownership history.
 */
export function useTimelineController(): TimelineController | null {
  const engine = useEu5Engine();
  const timeline = useEu5Timeline();
  const date = useEu5TimelineDate();
  const mapDate = useEu5TimelineMapDate();
  const live = useEu5TimelineLive();
  const playback = useEu5TimelinePlayback();
  const timelapse = useEu5Timelapse();

  const { start, end } = timeline;
  // Every direct move pauses playback; only `step` leaves that to the engine.
  const setDate = useCallback(
    (next: Eu5DateComponents) => {
      engine.trigger.pauseTimeline();
      engine.trigger.setTimelineDate(next);
    },
    [engine],
  );
  const setDayOffset = useCallback((day: number) => setDate(addDays(start, day)), [setDate, start]);
  const jumpToStart = useCallback(() => setDate(start), [setDate, start]);
  const jumpToEnd = useCallback(() => setDate(end), [setDate, end]);
  const step = useCallback(
    (unit: TimelineStepUnit, direction: 1 | -1) => engine.trigger.stepTimeline(unit, direction),
    [engine],
  );
  const togglePlayback = useCallback(() => engine.trigger.toggleTimelinePlayback(), [engine]);

  return useMemo(() => {
    if (!timeline.available) return null;
    return {
      timeline,
      date,
      live,
      playback,
      playing: playback === "playing" || playback === "rewinding",
      locked: timelapse.status !== "idle",
      totalDays: daysBetween(timeline.start, timeline.end),
      dayOffset: daysBetween(timeline.start, date),
      mapDayOffset: daysBetween(timeline.start, mapDate),
      setDayOffset,
      setDate,
      step,
      jumpToStart,
      jumpToEnd,
      togglePlayback,
    };
  }, [
    timeline,
    date,
    mapDate,
    live,
    playback,
    timelapse.status,
    setDayOffset,
    setDate,
    step,
    jumpToStart,
    jumpToEnd,
    togglePlayback,
  ]);
}
