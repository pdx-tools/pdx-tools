import { useState } from "react";
import type { KeyboardEvent } from "react";
import { cx } from "class-variance-authority";
import { Badge } from "@/components/Badge";
import { Popover } from "@/components/Popover";
import { Flag } from "@/features/eu4/components/avatars";
import type { LineRole } from "./historyOption";

/** What a row's rank cell holds; a rival names the country it is a rival of. */
export type RowPlace =
  | { kind: "rank"; text: string }
  | { kind: "rival"; of: string }
  | { kind: "outside" };

/** One row of the standings: a country at the selected time, or one without a figure then. */
export type StandingRow = {
  key: string;
  /** The rank cell: a rank ("3", "=3", or empty without a figure), a rival or the followed country from outside the filter. */
  place: RowPlace;
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
  /** The followed country, outside multiplayer: the only bold row. */
  bold?: boolean;
  /** Played at some point in the campaign, marked when others were not. */
  badge: boolean;
  gone: boolean;
  /** The change since the chart's baseline save, in a column of its own. */
  since?: string;
  /** Shares that add up to one, drawn as a bar with these colors and names. */
  split?: { shares: readonly number[]; colors: readonly string[]; labels: readonly string[] };
};

/** The widths of the columns after the figure, when the rows have them. */
export const SINCE_WIDTH = 96;
export const SPLIT_WIDTH = 76;

/** The heads of a table of more than one value column. */
export type StandingHeads = { figure: string; since?: string; split?: string };

/** The table's fixed columns: rank, flag, name, and the gaps between them. */
const RANK_WIDTH = 28;
const NAME_WIDTH = 100;
export const HEAD_HEIGHT = 20;
const TABLE_FIXED = RANK_WIDTH + 26 + NAME_WIDTH + 8;

/** The since column fits its head, which names the baseline: "spent since 1526 Mar 1". */
export const sinceWidthFor = (head: string | undefined) =>
  Math.max(SINCE_WIDTH, Math.ceil((head?.length ?? 0) * 6.4) + 8);

/** The columns a table shows in a width: uses go first, then since. */
export function tableColumns(
  rows: readonly StandingRow[],
  room: number,
  splitWidth: number,
  sinceWidth = SINCE_WIDTH,
) {
  const since = rows.some((row) => row.since !== undefined);
  const split = rows.some((row) => row.split);
  const base = TABLE_FIXED + FIGURE_WIDTH;
  const withSince = base + (since ? sinceWidth : 0);
  const showSplit = split && withSince + splitWidth <= room;
  const showSince = since && withSince <= room;
  return {
    since: showSince,
    split: showSplit,
    width: base + (showSince ? sinceWidth : 0) + (showSplit ? splitWidth : 0),
  };
}

/**
 * The width of the figure cell: seven characters, such as "-12,345", at
 * about 8.5 px each. It is the same for every figure, so a note is too.
 */
export const FIGURE_WIDTH = 60;

/**
 * A row's earlier names fit whole beside its name: about 7 px a character of
 * name and 5.6 of note, in what the rank, flag, badge and figure leave.
 */
export function noteFits(row: StandingRow): boolean {
  if (!row.note) return false;
  const room = 226 - 24 - 22 - 10 - FIGURE_WIDTH - (row.badge ? 44 : 0);
  return row.name.length * 7 + 6 + row.note.length * 5.6 <= room;
}

/** The followed and compared rows give a note that does not fit its own line. */
export function secondLine(row: StandingRow): boolean {
  return !!row.note && !noteFits(row) && (row.role === "subject" || row.pinned);
}

export type StandingsLayout =
  | {
      kind: "placed";
      /** Where a table's head row stands. */
      head?: number;
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
  heads = null,
  columns = { since: true, split: true },
  splitWidth = SPLIT_WIDTH,
  sinceWidth = SINCE_WIDTH,
  under = false,
  greyColor = "#9ca3af",
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
  /** A table of more than one value column has heads over its columns. */
  heads?: StandingHeads | null;
  /** The table's columns that fit. */
  columns?: { since: boolean; split: boolean };
  splitWidth?: number;
  sinceWidth?: number;
  /** The table stands under the chart, so each row carries its color. */
  under?: boolean;
  /** The color of a grey line, for the tick of its row. */
  greyColor?: string;
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
  const table = !!heads;
  const showSince = table ? columns.since : !narrow;
  const showSplit = table ? columns.split : !narrow;
  const bracket =
    !table && layout.kind === "placed" && layout.listed && layout.rows > 1
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
      {heads && (
        <div
          role="row"
          aria-hidden
          className={cx(
            "flex items-end border-0 border-b border-solid border-gray-300 pb-0.5 text-xs leading-4 whitespace-nowrap text-gray-600 dark:border-gray-600 dark:text-gray-300",
            layout.kind === "placed" && "absolute inset-x-0",
          )}
          style={{
            height: HEAD_HEIGHT,
            ...(layout.kind === "placed" ? { top: layout.head ?? 0 } : {}),
          }}
        >
          {/* Under the chart each row starts with its color tick. */}
          <span
            className="shrink-0 pr-1.5 text-right"
            style={{ width: RANK_WIDTH + (under ? 8 : 0) }}
          >
            #
          </span>
          <span className="shrink-0" style={{ width: 26 + NAME_WIDTH }}>
            Country
          </span>
          {/* The figure cell has its padding outside its width. */}
          <span className="box-content shrink-0 pl-2 text-right" style={{ width: FIGURE_WIDTH }}>
            {heads.figure}
          </span>
          {showSince && heads.since && (
            <span className="shrink-0 pl-2 text-right" style={{ width: sinceWidth }}>
              {heads.since}
            </span>
          )}
          {showSplit && heads.split && (
            <span className="shrink-0 pl-3 text-left" style={{ width: splitWidth }}>
              {heads.split}
            </span>
          )}
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
            <span role="columnheader">{heads?.figure ?? "Figure"}</span>
            {showSince && rows.some((row) => row.since !== undefined) && (
              <span role="columnheader">{heads?.since ?? "Since the baseline save"}</span>
            )}
            {showSplit && rows.some((row) => row.split) && (
              <span role="columnheader">Split by use</span>
            )}
          </div>
        </div>
        <div role="rowgroup" className={cx(placed && "relative")}>
          {rows.map((row, i) => {
            const height = layout.kind === "placed" ? layout.heights[i] : layout.rowHeight;
            const compared = row.role === "compared" || row.key === pointed;
            const subject = row.role === "subject";
            const grey = row.role === "grey" && !compared;
            // A table keeps a fixed name column: the note shows beside a short name, else
            // it is in the row's title.
            const fits = table
              ? row.name.length + 1 + (row.note?.length ?? 0) <= 16
              : noteFits(row);
            // In full beside the name where it fits; else on its own line for the followed and
            // compared rows that have the room, or in a small tag while a row is pointed at.
            const inline = !!row.note && (table || !narrow) && fits;
            const two = !table && !!row.note && !inline && height >= 34;
            const tag =
              !!row.note && !inline && !two && (row.key === pointed || row.key === focused);
            const flag = compact || narrow ? "mini" : "xs";
            return (
              <div
                role="row"
                key={row.key}
                data-key={row.key}
                tabIndex={row.key === tabKey ? 0 : -1}
                // The full name, and every tag it held, for a name cut short.
                title={row.lineage || row.name}
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
                {under && (
                  <span
                    aria-hidden
                    className="mr-1 h-3 w-1 shrink-0"
                    // The tick is the row's key to its line, so it has the line's color.
                    style={{
                      background: row.gone ? "transparent" : grey ? greyColor : row.color,
                    }}
                  />
                )}
                <span
                  role="cell"
                  className={cx(
                    "shrink-0 pr-1.5 text-right",
                    !table && (narrow ? "w-5" : "w-6"),
                    compact ? "text-[11px]" : "text-xs",
                    row.gone ? "text-transparent" : "text-gray-500 dark:text-gray-400",
                  )}
                  style={table ? { width: RANK_WIDTH } : undefined}
                  title={
                    row.place.kind === "rival"
                      ? `Rival of ${row.place.of}; not in your filter, so not ranked`
                      : row.place.kind === "outside"
                        ? "Not in your filter, so not ranked"
                        : undefined
                  }
                >
                  {row.place.kind === "rival" ? (
                    <span className="text-[10px]">rival</span>
                  ) : row.place.kind === "outside" ? (
                    <>
                      <span aria-hidden>–</span>
                      <span className="sr-only">not ranked</span>
                    </>
                  ) : (
                    row.place.text
                  )}
                </span>
                <span
                  role="rowheader"
                  className={cx("flex min-w-0 items-center gap-1.5", table ? "shrink-0" : "flex-1")}
                  style={table ? { width: 26 + NAME_WIDTH } : undefined}
                >
                  <span className={cx("flex shrink-0", row.gone && "opacity-55")}>
                    <Flag tag={row.tag} name={row.name}>
                      <Flag.Image size={flag} />
                    </Flag>
                  </span>
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span
                      className={cx(
                        "flex min-w-0 shrink-0 items-center gap-1 leading-4",
                        row.bold ? "font-bold" : "font-normal",
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
                    "box-content shrink-0 text-right whitespace-nowrap",
                    narrow && !table ? "pl-3" : "pl-2",
                    row.gone
                      ? "text-[11px] text-gray-500 dark:text-gray-400"
                      : cx(
                          "text-gray-950 dark:text-white",
                          row.bold ? "font-bold" : "font-normal",
                          compact || narrow ? "text-[13px]" : "text-[15px]",
                        ),
                  )}
                  // The narrow layout puts notes on their own line, so the name gets the room.
                  style={narrow && !table ? undefined : { width: FIGURE_WIDTH }}
                >
                  {row.figure}
                </span>
                {/* Narrow, the name keeps the room; the legend and hover hold the split. */}
                {row.since !== undefined && showSince && (
                  <span
                    role="cell"
                    className="shrink-0 text-right text-[13px] text-gray-700 dark:text-gray-200"
                    style={{ width: sinceWidth }}
                  >
                    {row.since}
                  </span>
                )}
                {row.split && showSplit && <SplitBar split={row.split} width={splitWidth} />}
              </div>
            );
          })}
        </div>
      </div>
      {flow && more > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 text-center text-[11px] leading-3.5 text-gray-600 dark:text-gray-300"
          style={{ top: flow.height + (heads ? HEAD_HEIGHT : 0) + 2 }}
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

/** How a country's whole is split, as a bar with no text; the legend says the colors. */
function SplitBar({ split, width }: { split: NonNullable<StandingRow["split"]>; width: number }) {
  // Largest first, as words for the hover and for assistive tech.
  const parts = split.shares
    .map((share, i) => ({ share, label: split.labels[i] }))
    .filter((x) => x.share > 0)
    .sort((a, b) => b.share - a.share)
    .map((x) => `${x.label} ${Math.round(x.share * 100)}%`);
  return (
    <span role="cell" className="flex shrink-0 justify-end" style={{ width }}>
      <span
        role="img"
        aria-label={parts.join(", ")}
        title={parts.join(", ")}
        className="flex h-2 gap-px overflow-hidden rounded-sm"
        style={{ width: width - 12 }}
      >
        {split.shares.map((share, i) =>
          share > 0 ? (
            <span key={i} style={{ flexGrow: share, background: split.colors[i] }} />
          ) : null,
        )}
      </span>
    </span>
  );
}
