import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { Tooltip } from "@/components/Tooltip";
import { focusRing } from "../components/focusRing";
import { daysBetween, formatLongDate } from "../lib/eu5Date";
import { buildDensity, buildYearTicks } from "./timelineScale";
import { handleTimelineKey } from "./useTimelineController";
import type { TimelineController } from "./useTimelineController";
import type { YearTick } from "./timelineScale";
import type { Eu5DateComponents, TimelineNote } from "@/wasm/wasm_eu5";
import styles from "./TimelineScrubber.module.css";

/** Vertical budget of each layer, in px. */
const STRIP = 16;
const TRACK = 18;
const LABELS = 14;
const HEIGHT = STRIP + TRACK + LABELS;
/** The y of the track line. */
const TRACK_Y = STRIP + TRACK / 2;

const DENSITY_BUCKET_PX = 2;

function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * The track of the campaign timeline: an activity strip of border changes,
 * year ticks, the named events, and a playhead the user can drag or steer
 * with the keyboard. The playhead follows the requested date; a fainter mark
 * shows where the map has caught up to when the two differ.
 */
export function TimelineScrubber({ controller }: { controller: TimelineController }) {
  const { timeline, totalDays, dayOffset, mapDayOffset, date, playback, setDayOffset, setDate } =
    controller;

  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const [dragging, setDragging] = useState(false);

  const px = useCallback(
    (day: number) => (totalDays === 0 ? 0 : (day / totalDays) * width),
    [totalDays, width],
  );

  const ticks = useMemo(
    () => buildYearTicks(timeline.start, timeline.end, width),
    [timeline.start, timeline.end, width],
  );
  const density = useMemo(
    () =>
      buildDensity(timeline.changeDays, timeline.changeCounts, totalDays, width, DENSITY_BUCKET_PX),
    [timeline.changeDays, timeline.changeCounts, totalDays, width],
  );
  const notes = useMemo(
    () =>
      timeline.notes.map((note) => ({
        ...note,
        day: daysBetween(timeline.start, note.date),
      })),
    [timeline.notes, timeline.start],
  );

  const dayAtClientX = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el || width === 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(ratio * totalDays);
    },
    [totalDays, width],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setDragging(true);
    setDayOffset(dayAtClientX(event.clientX));
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDayOffset(dayAtClientX(event.clientX));
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (handleTimelineKey(controller, event)) event.preventDefault();
  };

  const playheadX = px(dayOffset);
  const mapX = px(mapDayOffset);
  const showMapMark = Math.abs(mapX - playheadX) >= 1;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Campaign date"
      aria-valuemin={0}
      aria-valuemax={totalDays}
      aria-valuenow={dayOffset}
      aria-valuetext={formatLongDate(date)}
      data-dragging={dragging || undefined}
      data-playback={playback}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={cx(
        styles.scrubber,
        "relative w-full touch-none rounded-[var(--radius-plate)] select-none",
        dragging ? "cursor-grabbing" : "cursor-pointer",
        focusRing,
      )}
      style={{ height: HEIGHT }}
    >
      {width > 0 && (
        <svg
          aria-hidden
          width={width}
          height={HEIGHT}
          className="absolute inset-0 overflow-visible"
        >
          {/* Activity strip: where borders moved. Elapsed history in brass. */}
          {density.map((bar) => (
            <rect
              key={bar.x}
              x={bar.x}
              y={STRIP - Math.max(1, bar.level * STRIP)}
              width={Math.max(1, bar.w - 0.5)}
              height={Math.max(1, bar.level * STRIP)}
              className={cx(
                styles.bar,
                bar.firstDay <= dayOffset ? "fill-game-accent-500" : "fill-game-ink-700",
              )}
            />
          ))}

          <ScaleLayer ticks={ticks} width={width} px={px} />

          {/* Where the map has caught up to, when it trails the playhead. */}
          {showMapMark && (
            <line
              x1={mapX}
              x2={mapX}
              y1={0}
              y2={STRIP + TRACK}
              className="stroke-game-accent-300/50"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          )}
        </svg>
      )}

      {width > 0 && <NoteMarkers notes={notes} px={px} setDate={setDate} />}

      {/* Elapsed track and playhead: both move on `transform` with one glide. */}
      {width > 0 && (
        <div
          aria-hidden
          className={cx(
            styles.elapsed,
            "pointer-events-none absolute left-0 origin-left bg-game-accent-500",
          )}
          style={{
            top: TRACK_Y - 0.75,
            width,
            height: 1.5,
            transform: `scaleX(${totalDays === 0 ? 0 : dayOffset / totalDays})`,
          }}
        />
      )}
      {width > 0 && (
        <div
          aria-hidden
          className={cx(styles.playhead, "pointer-events-none absolute top-0 left-0 z-20")}
          style={{ transform: `translateX(${playheadX}px)`, height: STRIP + TRACK }}
        >
          <div className="absolute top-0 bottom-0 -left-px w-0.5 bg-game-accent-300" />
          <div
            className={cx(
              "absolute -left-[5px] h-[11px] w-[11px] rounded-full border-2 border-game-panel bg-game-accent-300",
              "shadow-[0_1px_3px_rgba(0,0,0,0.6)]",
            )}
            style={{ top: TRACK_Y - 5.5 }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The parts of the track that do not move with the date: year ticks and
 * labels, the track line, and the save date terminal. Memoized so a date
 * change, which comes every frame during playback, diffs only the strip.
 */
const ScaleLayer = memo(function ScaleLayer({
  ticks,
  width,
  px,
}: {
  ticks: YearTick[];
  width: number;
  px: (day: number) => number;
}) {
  return (
    <>
      {ticks.map((tick) => {
        const x = px(tick.day);
        return (
          <g key={tick.year}>
            <line
              x1={x}
              x2={x}
              y1={STRIP + TRACK - (tick.labeled ? 6 : 3)}
              y2={STRIP + TRACK}
              className={tick.labeled ? "stroke-game-ink-500" : "stroke-game-ink-700"}
              strokeWidth={1}
            />
            {tick.labeled && (
              <text
                x={x}
                y={HEIGHT - 2}
                textAnchor="middle"
                className="fill-game-ink-500 font-game-num text-[9.5px]"
              >
                {tick.year}
              </text>
            )}
          </g>
        );
      })}

      {/* Track. */}
      <line
        x1={0}
        x2={width}
        y1={TRACK_Y}
        y2={TRACK_Y}
        className="stroke-game-ink-700"
        strokeWidth={1}
      />

      {/* The save date: the end of what the save can show. It lights up
          once when playback arrives. */}
      <line
        x1={width - 0.5}
        x2={width - 0.5}
        y1={STRIP - 2}
        y2={STRIP + TRACK}
        className={cx(styles.terminal, "stroke-game-ink-500")}
        strokeWidth={1.5}
      />
    </>
  );
});

/** The named events of the campaign, each a button that jumps to its date. */
const NoteMarkers = memo(function NoteMarkers({
  notes,
  px,
  setDate,
}: {
  notes: (TimelineNote & { day: number })[];
  px: (day: number) => number;
  setDate: (date: Eu5DateComponents) => void;
}) {
  return notes.map((note) => (
    <Tooltip key={note.key + note.day}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          onClick={() => setDate(note.date)}
          aria-label={`${note.label}, ${formatLongDate(note.date)}`}
          className={cx(
            "absolute z-10 grid h-4 w-4 -translate-x-1/2 place-items-center rounded-[var(--radius-plate)]",
            "text-game-ink-300 transition-colors duration-100 hover:text-game-accent-100",
            focusRing,
          )}
          style={{ left: px(note.day), top: TRACK_Y - 8 }}
        >
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
            <path d="M5 0.5 L9.5 5 L5 9.5 L0.5 5 Z" fill="currentColor" />
          </svg>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="font-game-ui text-xs">
        <span className="font-medium">{note.label}</span>
        <span className="ml-2 font-game-num text-game-ink-300">{formatLongDate(note.date)}</span>
      </Tooltip.Content>
    </Tooltip>
  ));
});
