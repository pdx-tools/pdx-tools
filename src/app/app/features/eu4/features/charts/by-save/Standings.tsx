import { useState } from "react";
import type { KeyboardEvent } from "react";
import { cx } from "class-variance-authority";
import { Badge } from "@/components/Badge";
import { Popover } from "@/components/Popover";
import { Flag } from "@/features/eu4/components/avatars";
import type { LineRole } from "./historyOption";

/** One row of the standings: a country at the selected time, or one without a figure then. */
export type StandingRow = {
  key: string;
  /** "3", "=3", or empty for a country without a figure. */
  rank: string;
  tag: string;
  name: string;
  /** "was Castile", "was Viti and 32 earlier", or "later Spain". */
  note: string | null;
  /** Every tag of the country with the years it held it, when it held more than one. */
  chain: readonly { tag: string; name: string; span: string }[];
  /** Every tag of the country, for the row's title and assistive tech. */
  lineage: string;
  /** The figure, or why there is none: "until 1640". */
  figure: string;
  /** The color of the tag held at the selected save. */
  color: string;
  /** The role from the selection and pins; pointing is passed apart. */
  role: LineRole;
  pinned: boolean;
  /** Played at some point in the campaign, marked when others were not. */
  badge: boolean;
  gone: boolean;
};

/**
 * A row's earlier names fit whole beside its name: about 7 px a character of
 * name and 5.6 of note, in what the rank, flag, badge and figure leave.
 */
export function noteFits(row: StandingRow): boolean {
  if (!row.note) return false;
  const room = 226 - 24 - 22 - 10 - row.figure.length * 8.5 - (row.badge ? 44 : 0);
  return row.name.length * 7 + 6 + row.note.length * 5.6 <= room;
}

/** The followed and compared rows give a note that does not fit its own line. */
export function secondLine(row: StandingRow): boolean {
  return !!row.note && !noteFits(row) && (row.role === "subject" || row.pinned);
}

export type StandingsLayout =
  | {
      kind: "placed";
      tops: readonly number[];
      heights: readonly number[];
      tight: boolean;
      /** The rows stand in rank order, away from their values. */
      listed: boolean;
      /** How many rows have a figure. */
      rows: number;
    }
  | { kind: "flow"; height: number; rowHeight: number };

/**
 * The standings at the selected time as a table: one row renderer, placed
 * beside each country's value on the plot or, when there are many, a
 * scrolling list. One tab stop; the arrows move between rows.
 */
export function Standings({
  rows,
  layout,
  label,
  narrow,
  pointed,
  focusKey,
  focused = null,
  onPick,
  onPoint,
  onFocusRow,
  onScroll,
}: {
  rows: readonly StandingRow[];
  layout: StandingsLayout;
  /** The table's name: the figure and the save. */
  label: string;
  narrow: boolean;
  /** The country under the pointer or keyboard focus, drawn as compared. */
  pointed: string | null;
  /** The row that takes the tab stop. */
  focusKey: string | null;
  /** The row with keyboard focus now. */
  focused?: string | null;
  onPick: (key: string) => void;
  onPoint: (key: string | null) => void;
  onFocusRow: (key: string | null) => void;
  /** The scrolling list's offset, for the leaders drawn beside it. */
  onScroll: (top: number) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const tabKey = rows.some((row) => row.key === focusKey) ? focusKey : (rows[0]?.key ?? null);
  const placed = layout.kind === "placed";
  const compact = !placed || layout.tight;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(row.dataset.key!);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const next = (
        event.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling
      ) as HTMLElement | null;
      if (next?.dataset.key) next.focus();
    }
  };
  const flow = layout.kind === "flow" ? layout : null;
  const more = flow
    ? Math.max(0, Math.round(rows.length - (scrollTop + flow.height) / flow.rowHeight))
    : 0;
  const bracket =
    layout.kind === "placed" && layout.listed && layout.rows > 1
      ? {
          top: layout.tops[0],
          bottom: layout.tops[layout.rows - 1] + layout.heights[layout.rows - 1],
        }
      : null;
  return (
    <>
      {bracket && (
        <div
          className="absolute left-0.5 text-xs leading-3.5 text-gray-600 dark:text-gray-300"
          style={{ top: bracket.top - 16 }}
        >
          in rank order
        </div>
      )}
      <div
        role="table"
        aria-label={`${label}. Enter follows or compares the country of a row.`}
        className={cx(
          "w-full text-sm tabular-nums",
          placed ? "relative" : "[scrollbar-width:thin] overflow-y-auto overscroll-contain",
        )}
        style={flow ? { height: flow.height } : undefined}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          setScrollTop(top);
          onScroll(top);
        }}
      >
        <div role="rowgroup" className="sr-only">
          <div role="row">
            <span role="columnheader">Rank</span>
            <span role="columnheader">Country</span>
            <span role="columnheader">Figure</span>
          </div>
        </div>
        <div role="rowgroup" className={cx(placed && "relative")}>
          {rows.map((row, i) => {
            const height = layout.kind === "placed" ? layout.heights[i] : layout.rowHeight;
            const compared = row.role === "compared" || row.key === pointed;
            const subject = row.role === "subject";
            const grey = row.role === "grey" && !compared;
            const fits = noteFits(row);
            // In full beside the name where it fits; else on its own line for the followed and
            // compared rows that have the room, or in a small tag while a row is pointed at.
            const inline = !!row.note && !narrow && fits;
            const two = !!row.note && !inline && height >= 34;
            const tag =
              !!row.note && !inline && !two && (row.key === pointed || row.key === focused);
            const flag = compact || narrow ? "mini" : "xs";
            return (
              <div
                role="row"
                key={row.key}
                data-key={row.key}
                tabIndex={row.key === tabKey ? 0 : -1}
                title={row.lineage || undefined}
                aria-current={subject ? "true" : undefined}
                className={cx(
                  "flex cursor-pointer items-center rounded-[3px] pr-0.5 outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400",
                  placed ? "absolute inset-x-0" : "relative",
                  row.pinned
                    ? "bg-gray-200/80 dark:bg-gray-600/60"
                    : compared
                      ? "bg-gray-100 dark:bg-gray-700/60"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700/40",
                  !placed && subject && "sticky top-0 bottom-0 z-1 bg-white dark:bg-slate-900",
                )}
                style={placed ? { top: layout.tops[i], height } : { height }}
                onClick={() => onPick(row.key)}
                onPointerEnter={() => onPoint(row.key)}
                onPointerLeave={() => onPoint(null)}
                onFocus={() => onFocusRow(row.key)}
                onBlur={() => onFocusRow(null)}
                onKeyDown={onKeyDown}
              >
                <span
                  role="cell"
                  className={cx(
                    "shrink-0 pr-1.5 text-right",
                    narrow ? "w-5" : "w-6",
                    compact ? "text-[11px]" : "text-xs",
                    row.gone ? "text-transparent" : "text-gray-500 dark:text-gray-400",
                  )}
                >
                  {row.rank}
                </span>
                <span role="rowheader" className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className={cx("flex shrink-0", row.gone && "opacity-55")}>
                    <Flag tag={row.tag} name={row.name}>
                      <Flag.Image size={flag} />
                    </Flag>
                  </span>
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span
                      className={cx(
                        "flex min-w-0 shrink-0 items-center gap-1 leading-4",
                        subject ? "font-bold" : compared ? "font-semibold" : "font-normal",
                        row.gone
                          ? "text-gray-500 dark:text-gray-400"
                          : grey
                            ? "text-gray-600 dark:text-gray-300"
                            : "text-gray-950 dark:text-white",
                        compact || narrow ? "text-[13px]" : "text-sm",
                      )}
                    >
                      <span className="truncate">{row.name}</span>
                      {row.badge && (
                        <Badge
                          variant="default"
                          className="shrink-0 px-1 py-0 text-[10px] leading-3.5"
                        >
                          player
                        </Badge>
                      )}
                    </span>
                    {inline && row.note && (
                      <Note row={row} reachable={row.key === tabKey} note={row.note} />
                    )}
                    <span className="sr-only">
                      {row.lineage ? `, ${row.lineage}` : ""}
                      {subject ? ", followed" : row.pinned ? ", compared" : ""}
                    </span>
                  </span>
                </span>
                {(two || tag) && row.note && (
                  <span
                    className={cx(
                      "absolute left-[3.25rem] z-2 flex",
                      two
                        ? "bottom-0.5"
                        : cx(
                            // In the scrolling list it opens above, where the list keeps it in view.
                            placed ? "top-full" : "bottom-full",
                            "rounded-sm border border-solid border-gray-200 bg-white px-1 shadow-sm dark:border-gray-600 dark:bg-slate-900",
                          ),
                    )}
                  >
                    <Note row={row} reachable={row.key === tabKey} note={row.note} />
                  </span>
                )}
                <span
                  role="cell"
                  className={cx(
                    narrow ? "shrink-0 pl-3 text-right" : "shrink-0 pl-2 text-right",
                    row.gone
                      ? "text-[11px] text-gray-500 dark:text-gray-400"
                      : cx(
                          "text-gray-950 dark:text-white",
                          subject ? "font-extrabold" : "font-medium",
                          compact || narrow ? "text-[13px]" : "text-[15px]",
                        ),
                  )}
                >
                  {row.figure}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {flow && more > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 text-center text-[11px] leading-3.5 text-gray-600 dark:text-gray-300"
          style={{ top: flow.height + 2 }}
        >
          {more} more ↓
        </div>
      )}
    </>
  );
}

/** "was Viti and 32 earlier": a long chain opens to every name it held. */
function Note({
  row,
  note,
  reachable,
}: {
  row: StandingRow;
  note: string;
  /** The row has the tab stop, so Tab from it reaches the list. */
  reachable: boolean;
}) {
  // Never cut short: a note is only shown where it fits or where it may run on.
  const text = "whitespace-nowrap text-[11px] leading-3 text-gray-500 dark:text-gray-400";
  if (row.chain.length < 3) return <span className={text}>{note}</span>;
  return (
    <Popover>
      <Popover.Trigger asChild>
        <button
          type="button"
          tabIndex={reachable ? 0 : -1}
          className={cx(
            text,
            "cursor-pointer text-left underline decoration-dotted underline-offset-2",
          )}
          aria-label={`All ${row.chain.length} names of ${row.name}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {note}
        </button>
      </Popover.Trigger>
      <Popover.Content
        align="start"
        // Events in the portal still bubble through React to the row: keep them in the list.
        onClick={(event) => event.stopPropagation()}
        onPointerEnter={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="max-h-80 w-[min(560px,90vw)] overflow-y-auto rounded-md border border-gray-300 bg-white p-3 text-xs shadow-md dark:border-gray-600 dark:bg-slate-900"
      >
        <ol className="columns-2 gap-x-6 sm:columns-3">
          {row.chain.map((held, i) => (
            <li
              key={`${held.tag}${i}`}
              className="flex break-inside-avoid items-center gap-1.5 py-0.5"
            >
              <Flag tag={held.tag} name={held.name}>
                <Flag.Image size="micro" />
              </Flag>
              <span className="truncate text-gray-900 dark:text-white">{held.name}</span>
              <span className="ml-auto pl-2 text-gray-500 tabular-nums dark:text-gray-400">
                {held.span}
              </span>
            </li>
          ))}
        </ol>
      </Popover.Content>
    </Popover>
  );
}
