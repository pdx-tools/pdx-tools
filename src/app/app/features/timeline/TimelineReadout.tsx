import { cx } from "class-variance-authority";
import { MONTH_ABBR } from "./date";
import type { TimelineController } from "./controller";

/**
 * Hidden copies of each month with a two-figure day, in one grid cell. The
 * cell takes the width of the widest, so the readout keeps one width in any
 * face and the scrubber next to it does not move during playback.
 */
const MONTH_SIZERS = MONTH_ABBR.filter(Boolean).map((month) => (
  <span key={month} aria-hidden="true" className="invisible col-start-1 row-start-1">
    {month} 00
  </span>
));

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
      <span className="inline-grid font-game-num text-game-small text-game-ink-300">
        {MONTH_SIZERS}
        <span className="col-start-1 row-start-1">
          {MONTH_ABBR[date.month]} {date.day}
        </span>
      </span>
    </p>
  );
}
