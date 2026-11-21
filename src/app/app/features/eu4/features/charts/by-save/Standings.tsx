import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { cx } from "class-variance-authority";
import { Badge } from "@/components/Badge";
import { Flag } from "@/features/eu4/components/avatars";
import type { LineRole } from "./historyOption";

/** One row of the standings: a country at the selected time, or one without a figure then. */
export type StandingRow = {
  key: string;
  /** "3", "=3", or empty for a country without a figure. */
  rank: string;
  tag: string;
  name: string;
  /** "was Castile" or "later Spain", shown when the row has room for a second line. */
  note: string | null;
  /** Every tag of the country, for the row's title and assistive tech. */
  lineage: string;
  /** The figure, or why there is none: "until 1640". */
  figure: string;
  color: string;
  role: LineRole;
  back: boolean;
  pinned: boolean;
  /** Played at some point in the campaign, marked when others were not. */
  badge: boolean;
  gone: boolean;
};

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
  | { kind: "flow"; height: number };

export const rowGrid = "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-1.5";
const narrowGrid = "grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-1";

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
  focusKey,
  onPick,
  onPoint,
  onFocusRow,
}: {
  rows: readonly StandingRow[];
  layout: StandingsLayout;
  /** The table's name: the figure and the save. */
  label: string;
  narrow: boolean;
  /** The row that takes the tab stop. */
  focusKey: string | null;
  onPick: (key: string) => void;
  onPoint: (key: string | null) => void;
  onFocusRow: (key: string | null) => void;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const tabKey = rows.some((row) => row.key === focusKey) ? focusKey : (rows[0]?.key ?? null);
  const placed = layout.kind === "placed";
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
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
      next?.focus();
    }
  };
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
          aria-hidden
          className="absolute -left-2 w-1.5 rounded-l-sm border-y border-l border-gray-400 dark:border-gray-500"
          style={{ top: bracket.top + 3, height: bracket.bottom - bracket.top - 6 }}
        />
      )}
      {bracket && (
        <div
          className="absolute left-1 text-[11px] leading-3 text-gray-500 dark:text-gray-400"
          style={{ top: bracket.top - 13 }}
        >
          In rank order
        </div>
      )}
      <table
        aria-label={`${label}. Enter follows or compares the country of a row.`}
        className={cx(
          "w-full text-sm",
          placed
            ? "relative block"
            : "block overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,black_88%,transparent)]",
        )}
        style={layout.kind === "flow" ? { height: layout.height } : undefined}
      >
        <thead className="sr-only">
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Country</th>
            <th scope="col">Figure</th>
          </tr>
        </thead>
        <tbody ref={body} className={cx("block", placed && "relative")}>
          {rows.map((row, i) => {
            const lead = row.role === "subject" || row.role === "compared";
            const height = placed ? layout.heights[i] : 22;
            const two = !!row.note && height >= 34;
            return (
              <tr
                key={row.key}
                data-key={row.key}
                tabIndex={row.key === tabKey ? 0 : -1}
                title={row.lineage}
                aria-current={row.role === "subject" ? "true" : undefined}
                className={cx(
                  narrow ? narrowGrid : rowGrid,
                  "cursor-pointer rounded-sm px-1 transition-opacity focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-600",
                  placed ? "absolute inset-x-0" : "relative",
                  row.pinned && "bg-gray-200/70 dark:bg-gray-600/50",
                  row.role === "compared" && !row.pinned && "bg-gray-100 dark:bg-gray-700/50",
                  row.back && "opacity-50",
                )}
                style={placed ? { top: layout.tops[i], height } : { height }}
                onClick={() => onPick(row.key)}
                onPointerEnter={() => onPoint(row.key)}
                onPointerLeave={() => onPoint(null)}
                onFocus={() => onFocusRow(row.key)}
                onBlur={() => onFocusRow(null)}
                onKeyDown={onKeyDown}
              >
                <td
                  className={cx(
                    "text-right text-xs tabular-nums",
                    row.gone ? "text-transparent" : "text-gray-500 dark:text-gray-400",
                  )}
                >
                  {!placed && !row.gone && (
                    <span
                      aria-hidden
                      className="mr-1 inline-block h-3 w-1 align-[-1px]"
                      style={{ background: row.color }}
                    />
                  )}
                  {row.rank}
                </td>
                <td className="flex min-w-0 items-center gap-1.5">
                  <span className={cx("shrink-0", row.gone && "opacity-50")}>
                    <Flag tag={row.tag} name={row.name}>
                      <Flag.Image size="xs" />
                    </Flag>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span
                      className={cx(
                        "flex min-w-0 items-center gap-1 leading-4",
                        row.role === "subject"
                          ? "font-bold"
                          : lead
                            ? "font-semibold"
                            : "font-medium",
                        row.gone
                          ? "text-gray-500 dark:text-gray-400"
                          : row.role === "grey"
                            ? "text-gray-600 dark:text-gray-300"
                            : "text-gray-900 dark:text-white",
                        narrow ? "text-[13px]" : "text-sm",
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
                    {two && (
                      <span className="truncate text-xs leading-4 text-gray-500 dark:text-gray-400">
                        {row.note}
                      </span>
                    )}
                    <span className="sr-only">
                      {row.lineage}
                      {row.role === "subject" ? ", followed" : row.pinned ? ", compared" : ""}
                    </span>
                  </span>
                </td>
                <td
                  className={cx(
                    "text-right tabular-nums",
                    row.gone
                      ? "text-xs text-gray-500 dark:text-gray-400"
                      : cx(
                          "text-gray-900 dark:text-white",
                          row.role === "subject" ? "font-bold" : "font-medium",
                          narrow ? "text-[13px]" : "text-sm",
                        ),
                  )}
                >
                  {row.figure}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
