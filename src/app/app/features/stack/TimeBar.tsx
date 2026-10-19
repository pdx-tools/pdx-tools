import React from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { microLabel } from "./parts";

/** An event on the time bar. Dates are ISO days (eg: "1941-02-13"). */
export type TimeEvent = { date: string };

export type TimeBin<E> = {
  /** The first day of the period */
  from: string;
  /** The first day after the period */
  to: string;
  label: string;
  events: E[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1941-02-13" as "13 Feb 1941" */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-");
  return `${+d} ${MONTHS[+m - 1]} ${+y}`;
}

/** The narrowest bar that still reads and still takes a pointer */
const MIN_BIN_PX = 6;

/**
 * Bins of 3, 6, 12, or more months, the shortest that fits the width. A
 * short war fits in quarters; a long campaign merges into years.
 */
export function makeBins<E extends TimeEvent>(
  start: string,
  end: string,
  events: E[],
  width: number,
): { bins: TimeBin<E>[]; size: number; first: number } {
  const [y0, m0] = start.split("-").map(Number);
  const [y1, m1] = end.split("-").map(Number);
  const months = (y1 - y0) * 12 + (m1 - m0) + 1;
  const maxBins = Math.max(1, Math.floor(width / MIN_BIN_PX));
  let size = 3;
  while (Math.ceil(months / size) > maxBins) {
    size = size < 12 ? size * 2 : size + 12;
  }

  // Align bins to the calendar: quarters start in Jan, Apr, Jul, Oct.
  const first = y0 * 12 + (m0 - 1) - ((y0 * 12 + (m0 - 1)) % size);
  const last = y1 * 12 + (m1 - 1);
  const bins: TimeBin<E>[] = [];
  for (let at = first; at <= last; at += size) {
    const year = Math.floor(at / 12);
    const month = at % 12;
    const endAt = at + size - 1;
    const label =
      size === 12
        ? `${year}`
        : size > 12
          ? `${year}–${Math.floor(endAt / 12)}`
          : `${MONTHS[month]}–${MONTHS[endAt % 12]} ${year}`;
    const next = at + size;
    bins.push({
      from: `${year}-${String(month + 1).padStart(2, "0")}-01`,
      to: `${Math.floor(next / 12)}-${String((next % 12) + 1).padStart(2, "0")}-01`,
      label,
      events: [],
    });
  }

  for (const event of events) {
    let k = 0;
    while (k + 1 < bins.length && bins[k + 1].from <= event.date) k++;
    bins[k]?.events.push(event);
  }
  return { bins, size, first };
}

/**
 * The bottom edge of the map is time. One axis and one activity strip: the
 * height of a bar is the count of events in that period, the same for every
 * game. When a level is open, its own events are bright over the rest.
 */
export function TimeBar<E extends TimeEvent>({
  start,
  end,
  events,
  isRelated,
  openDate,
  onOpenBin,
  onHoverBin,
  describe,
  filterLabel,
}: {
  start: string;
  end: string;
  events: E[];
  /** Null when no level is open, so no event is brighter than another */
  isRelated: ((event: E) => boolean) | null;
  /** The date of the open event, if any. Its period lights. */
  openDate?: string | null;
  onOpenBin: (bin: TimeBin<E>) => void;
  onHoverBin: (bin: TimeBin<E> | null) => void;
  describe: (event: E) => string;
  filterLabel: string;
}) {
  const stripRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(600);
  const [hovered, setHovered] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { bins, size, first } = React.useMemo(
    () => makeBins(start, end, events, width),
    [start, end, events, width],
  );
  const max = Math.max(1, ...bins.map((x) => x.events.length));
  const related = isRelated ? events.filter(isRelated).length : null;

  // The bins split the strip evenly, so a year sits at its month offset.
  const at = (year: number) => ((year * 12 - first) / (bins.length * size)) * 100;
  const years: number[] = [];
  for (let y = +bins[0].from.slice(0, 4) + 1; y <= +end.slice(0, 4); y++) years.push(y);
  // Label every year while they fit, then every other, and so on.
  const yearStep = Math.max(1, Math.ceil((years.length * 34) / Math.max(1, width)));

  const hoveredBin = hovered === null ? null : bins[hovered];
  const barHeight = (n: number) => (n ? Math.max(2, Math.round((n / max) * 30)) : 0);

  const setHover = (index: number | null) => {
    setHovered(index);
    onHoverBin(index === null || !bins[index].events.length ? null : bins[index]);
  };

  return (
    <div
      className="absolute inset-x-2 bottom-2 z-[4] grid grid-cols-[92px_minmax(0,1fr)] gap-x-2.5 rounded-[var(--radius-panel)] border border-game-line-strong bg-game-overlay px-3 pt-2 pb-1.5 shadow-[0_20px_25px_-5px_rgb(0_0_0/0.35)] backdrop-blur-md"
      onPointerLeave={() => setHover(null)}
    >
      <div className="grid content-start gap-[3px]">
        <span className={cx(microLabel, "text-[9.5px]")}>Events</span>
        <span className="font-game-num text-[11px] text-game-ink-300 tabular-nums">
          {events.length === 0
            ? "None yet"
            : related !== null
              ? `${related} of ${events.length}`
              : events.length}
        </span>
        <span className="text-[10.5px] leading-tight text-game-ink-500">{filterLabel}</span>
      </div>
      <div
        ref={stripRef}
        className="relative flex h-8 items-end gap-px border-b border-game-line-strong"
        role="group"
        aria-label="Events by period"
      >
        {bins.length < 2 ? (
          <span className="self-center text-[11.5px] text-game-ink-500">
            The campaign starts here. Its wars and losses will collect on this line.
          </span>
        ) : null}
        {bins.length < 2
          ? null
          : bins.map((bin, k) => {
              const all = bin.events.length;
              const rel = isRelated ? bin.events.filter(isRelated).length : 0;
              const relH = isRelated ? barHeight(rel) : 0;
              const allH = barHeight(all) - relH;
              const open = openDate != null && openDate >= bin.from && openDate < bin.to;
              return (
                <button
                  key={bin.from}
                  type="button"
                  disabled={!all}
                  aria-pressed={open}
                  aria-label={`${bin.label}: ${all} event${all === 1 ? "" : "s"}`}
                  className={cx(
                    "flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-[1px]",
                    all ? "cursor-pointer hover:bg-white/5" : "cursor-default",
                    hovered === k && "bg-white/5",
                    focusRing,
                  )}
                  onPointerEnter={() => setHover(k)}
                  onFocus={() => setHover(k)}
                  onBlur={() => setHover(null)}
                  onClick={() => onOpenBin(bin)}
                >
                  <i
                    className={cx(
                      "block rounded-t-[1px]",
                      open
                        ? "bg-game-accent-300"
                        : isRelated
                          ? "bg-game-ink-700"
                          : "bg-game-ink-500",
                    )}
                    style={{ height: allH }}
                  />
                  <i
                    className={cx("block", open ? "bg-game-accent-300" : "bg-game-ink-100")}
                    style={{ height: relH }}
                  />
                </button>
              );
            })}
        {hoveredBin && hoveredBin.events.length ? (
          <div
            className="pointer-events-none absolute bottom-[calc(100%+10px)] z-[5] grid max-w-[280px] min-w-[170px] gap-1 rounded-[var(--radius-panel)] border border-game-line-strong bg-game-overlay px-2.5 py-2 text-[12px] shadow-[0_10px_15px_-3px_rgb(0_0_0/0.35)] backdrop-blur-md"
            style={{
              left: `clamp(0px, calc(${((hovered! + 0.5) / bins.length) * 100}% - 110px), calc(100% - 220px))`,
            }}
          >
            <div className="text-game-ink-500">
              {hoveredBin.label} · {hoveredBin.events.length} event
              {hoveredBin.events.length === 1 ? "" : "s"}
            </div>
            {hoveredBin.events.slice(0, 4).map((event, i) => (
              <div key={i} className="text-game-ink-100">
                {describe(event)}
              </div>
            ))}
            {hoveredBin.events.length > 4 ? (
              <div className="text-game-ink-500">and {hoveredBin.events.length - 4} more</div>
            ) : null}
          </div>
        ) : null}
      </div>
      <span />
      <div className="relative mt-[3px] h-3.5" aria-hidden>
        {years.map((y, i) => {
          const left = at(y);
          return (
            <React.Fragment key={y}>
              <span
                className="absolute -top-[3px] h-[3px] w-px bg-game-ink-700"
                style={{ left: `${left}%` }}
              />
              {/* The end date owns the last 72px of the axis. */}
              {i % yearStep === 0 && (left / 100) * width < width - 72 ? (
                <span
                  className="absolute top-0 -translate-x-1/2 font-game-num text-[9.5px] text-game-ink-500 tabular-nums"
                  style={{ left: `${left}%` }}
                >
                  {y}
                </span>
              ) : null}
            </React.Fragment>
          );
        })}
        <span className="absolute top-0 right-0 font-game-num text-[9.5px] text-game-ink-300 tabular-nums">
          {formatDay(end)}
        </span>
      </div>
    </div>
  );
}
