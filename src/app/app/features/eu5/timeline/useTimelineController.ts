import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useEu5Engine,
  useEu5Timelapse,
  useEu5Timeline,
  useEu5TimelineDate,
  useEu5TimelineLive,
  useEu5TimelineMapDate,
  useEu5TimelinePlayback,
} from "../store";
import type { TimelinePlayback, TimelineStepUnit } from "../ui-engine";
import { addDays, daysBetween } from "../lib/eu5Date";
import type { Eu5DateComponents, TimelineData } from "@/wasm/wasm_eu5";

export type TimelineController = {
  timeline: TimelineData;
  /** The date the user asked for; the readout and playhead follow this. */
  date: Eu5DateComponents;
  live: boolean;
  playback: TimelinePlayback;
  /** True while the date advances or rewinds; Pause is the offered action. */
  playing: boolean;
  /**
   * True while a recording drives the date. The controls stand down: the film
   * is the campaign from end to end, and a nudge would land in it.
   */
  locked: boolean;
  totalDays: number;
  dayOffset: number;
  /** Days after the start that the map has rendered; trails `dayOffset` during a drag. */
  mapDayOffset: number;
  setDayOffset: (day: number) => void;
  setDate: (date: Eu5DateComponents) => void;
  step: (unit: TimelineStepUnit, direction: 1 | -1) => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
  togglePlayback: () => void;
};

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

/** Step unit for an arrow key or a step button: Shift is a month, Ctrl a year. */
export function stepUnitForModifiers(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): TimelineStepUnit {
  if (event.ctrlKey || event.metaKey) return "year";
  if (event.shiftKey) return "month";
  return "day";
}

/**
 * Run a timeline key on the controller. Returns true when the key was one
 * of the timeline's, so the caller can consume the event. The full set is
 * the ARIA slider's: arrows step (Shift a month, Ctrl a year), Page keys
 * step a year, Home and End jump to the ends, Space plays and pauses.
 */
export function handleTimelineKey(
  controller: TimelineController,
  event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
): boolean {
  switch (event.key) {
    case " ":
      controller.togglePlayback();
      return true;
    case "ArrowLeft":
    case "ArrowDown":
      controller.step(stepUnitForModifiers(event), -1);
      return true;
    case "ArrowRight":
    case "ArrowUp":
      controller.step(stepUnitForModifiers(event), 1);
      return true;
    case "PageDown":
      controller.step("year", -1);
      return true;
    case "PageUp":
      controller.step("year", 1);
      return true;
    case "Home":
      controller.jumpToStart();
      return true;
    case "End":
      controller.jumpToEnd();
      return true;
    default:
      return false;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

/** The keys that work anywhere in the window; the rest belong to the focused slider. */
const WINDOW_KEYS = new Set([" ", "ArrowLeft", "ArrowRight", "Home", "End"]);
/** Controls that read arrow, Home and End keys themselves. */
const ARROW_CONSUMERS =
  "[role='slider'], select, [role='menu'], [role='listbox'], [role='combobox']";
/** Controls that Space or Enter activates; the timeline must not double up. */
const ACTIVATABLE = "button, select, a, [role='button'], [role='menuitem'], [role='option']";

/**
 * Whole-window keys for the mounted timeline control: Space plays and pauses,
 * arrows step (Shift a month, Ctrl a year), Home and End jump to the ends.
 * Focus can rest on any button after a click, so the arrows and Home and End
 * stay live there; a button does not read them. They yield only to controls
 * that do, such as the scrubber itself, a select or a menu, and to any
 * handler that already claimed the event. Space yields to whatever it would
 * activate.
 */
export function useTimelineKeyboard(controller: TimelineController | null) {
  // The controller changes on every date, so the listener reads it through
  // a ref and stays registered for the life of the control.
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const mounted = controller !== null;

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const controller = controllerRef.current;
      if (controller === null || controller.locked || !WINDOW_KEYS.has(event.key)) return;
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest(ARROW_CONSUMERS)) return;
      if (event.key === " " && target?.closest(ACTIVATABLE)) return;

      if (handleTimelineKey(controller, event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted]);
}
