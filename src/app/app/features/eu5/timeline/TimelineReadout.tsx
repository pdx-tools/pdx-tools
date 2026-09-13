import { cx } from "class-variance-authority";
import { MONTH_ABBR } from "../lib/eu5Date";
import type { TimelineController } from "./useTimelineController";

/**
 * The date the map shows. The year leads; month and day follow in the
 * numeral face so the figures stay aligned as they tick during playback.
 */
export function TimelineReadout({
  controller,
  className,
}: {
  controller: TimelineController;
  className?: string;
}) {
  const { date } = controller;

  return (
    <p className={cx("flex items-baseline gap-1.5 whitespace-nowrap tabular-nums", className)}>
      <span className="font-game-num text-[20px] leading-none font-medium text-game-ink-100">
        {date.year}
      </span>
      {/* The day reserves two figures of width so the readout does not
          breathe as it ticks from the 9th to the 10th. The reserve sits
          after the figure, where nothing follows, so a single digit sits
          tight against the month. */}
      <span className="font-game-num text-[11px] text-game-ink-300">
        {MONTH_ABBR[date.month]} <span className="inline-block min-w-[2ch]">{date.day}</span>
      </span>
    </p>
  );
}
