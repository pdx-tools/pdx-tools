import { useCallback, useMemo } from "react";
import {
  useEu4Actions,
  useEu4Timelapse,
  useEu4Timeline,
  useEu4TimelineLocked,
  useEu4TimelineMapDay,
  useEu4TimelinePlayback,
  useEu4TimelineRequestedDay,
} from "../../store";
import { addDays, daysBetween } from "@/features/timeline/date";
import type { TimelineController } from "@/features/timeline/controller";

/**
 * One view of the campaign timeline for a control to render, on the EU4
 * store. Returns `null` when the save has no history for the current mode.
 */
export function useTimelineController(): TimelineController | null {
  const timeline = useEu4Timeline();
  const dayOffset = useEu4TimelineRequestedDay();
  const mapDayOffset = useEu4TimelineMapDay();
  const playback = useEu4TimelinePlayback();
  const locked = useEu4TimelineLocked();
  const timelapse = useEu4Timelapse();
  const actions = useEu4Actions();
  const totalDays = daysBetween(timeline.start, timeline.end);
  const date = useMemo(() => addDays(timeline.start, dayOffset), [timeline.start, dayOffset]);
  const setDayOffset = useCallback(
    (day: number) => {
      actions.pauseTimeline();
      void actions.setSelectedDateDay(day);
    },
    [actions],
  );
  const setDate = useCallback(
    (next: typeof date) => {
      actions.pauseTimeline();
      void actions.setSelectedDateDay(daysBetween(timeline.start, next));
    },
    [actions, timeline.start],
  );

  return useMemo(() => {
    if (!timeline.available) return null;
    return {
      timeline,
      date,
      live: dayOffset >= totalDays,
      playback,
      playing: playback === "playing" || playback === "rewinding",
      locked: locked || timelapse.status !== "idle",
      totalDays,
      dayOffset,
      mapDayOffset,
      setDayOffset,
      setDate,
      step: actions.stepTimeline,
      jumpToStart: () => setDate(timeline.start),
      jumpToEnd: () => setDate(timeline.end),
      togglePlayback: actions.toggleTimelinePlayback,
    };
  }, [
    timeline,
    date,
    dayOffset,
    totalDays,
    playback,
    locked,
    timelapse.status,
    mapDayOffset,
    setDayOffset,
    setDate,
    actions,
  ]);
}
