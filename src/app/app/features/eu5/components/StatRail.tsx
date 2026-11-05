import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "class-variance-authority";
import { Tooltip } from "@/components/Tooltip";
import { sectionLabel } from "@/components/game/SectionTitle";
import { focusRing } from "@/components/game/focusRing";
import { glossaryTerm } from "./EntityName";
import { formatInt } from "@/lib/format";
import { ExactValue } from "../stack/parts";
import { MASS_TIE, rankLabel } from "../stack/selection";

/**
 * StatRail — the EU5 "dense rail" stat display (Design Spec §10).
 *
 * A single dense, sectioned rail of metrics for entity profiles. Each row
 * carries only the pieces it has: a label, an optional bar (bounded ratios
 * only), the value, an optional rank, and an optional delta. The rows run to the
 * edge of the level and have no card around them. The rail is narrow by default (one column) and reflows into 2 then 3
 * columns in wide containers via a container query — section headers always
 * span the full width and rows flow into as many columns as the container
 * affords, leaving ragged (never blank) tails.
 */

export interface StatRailRowProps {
  label: ReactNode;
  value: ReactNode;
  /** Dimmed denominator rendered after the value, e.g. `88 / 112`. */
  denom?: ReactNode;
  /** Bounded ratio in [0, 1]. Omit for raw counts — the track stays empty. */
  bar?: number;
  /**
   * Where the row stands among the cohort, from 0 to 1, as a dot on a thin rule. A
   * dot does not read as the length of the value, and it does not read as a slider.
   */
  percentile?: number;
  /** Positions on the same scale, as short dim ticks that the note names */
  ticks?: readonly number[];
  /** 1-based rank within the rail's cohort, as "#293". */
  rank?: number;
  /** How many countries share this rank, with this one */
  tied?: number;
  /** Reserved for future use; not rendered today. */
  delta?: { value: string; dir: "up" | "down" | "flat" };
  tooltip?: ReactNode;
  /** The full value behind a compact `value`, shown on hover and on keyboard focus */
  exact?: string;
  /** No row of this rail has a rank, so the value ends on the row's inset */
  unranked?: boolean;
  /** The row is a cell of a grid of rows, so the label keeps the room, as in a narrow column */
  compact?: boolean;
}

function Rank({ rank, tied }: { rank: number | undefined; tied: number }) {
  return (
    <span
      title={tied > 1 ? `${formatInt(tied)} countries share this rank` : undefined}
      className="text-right font-game-num text-[12px] whitespace-nowrap text-game-ink-300 tabular-nums"
    >
      {rank !== undefined && rankLabel(rank, tied)}
    </span>
  );
}

function Row({
  label,
  value,
  denom,
  bar,
  percentile,
  ticks = [0.5],
  rank,
  tied = 1,
  tooltip,
  exact,
  unranked,
  compact,
}: StatRailRowProps) {
  const labelNode = (
    <span
      tabIndex={tooltip ? 0 : undefined}
      className={cx(
        "min-w-0 rounded-[1px] font-game-ui text-[12px]",
        "text-game-ink-100",
        tooltip && glossaryTerm,
        tooltip && focusRing,
      )}
    >
      {label}
    </span>
  );

  return (
    <div
      className={cx(
        "grid h-[30px] items-center gap-x-2.5 border-b border-game-line-faint bg-game-panel pr-8 pl-3.5",
        // In a narrow column the label keeps the room. Else the mark is close to its
        // label, and the track takes the free width.
        compact
          ? "grid-cols-[1fr_40px_64px] gap-x-1.5"
          : unranked
            ? "grid-cols-[150px_minmax(0,1fr)_64px] @max-[400px]/sg:grid-cols-[1fr_40px_64px]"
            : "grid-cols-[116px_minmax(0,1fr)_60px_44px] @max-[400px]/sg:grid-cols-[1fr_40px_64px_40px] @[560px]/sg:grid-cols-[150px_minmax(0,1fr)_64px_48px]",
        "@max-[400px]/sg:gap-x-1.5",
      )}
    >
      {tooltip ? (
        <Tooltip>
          <Tooltip.Trigger asChild>{labelNode}</Tooltip.Trigger>
          <Tooltip.Content side="top" className="max-w-72 text-xs">
            {tooltip}
          </Tooltip.Content>
        </Tooltip>
      ) : (
        labelNode
      )}

      {/* Bar track — only painted for bounded ratios. */}
      <span className="flex items-center">
        {bar !== undefined && (
          <span className="relative h-1 w-full rounded-[1px] bg-game-track">
            {bar > 0 ? (
              <span
                className="absolute inset-y-0 left-0 rounded-[1px] bg-game-ink-300"
                style={{ width: `${Math.min(1, bar) * 100}%`, minWidth: 2 }}
              />
            ) : null}
          </span>
        )}
        {percentile !== undefined && tied > MASS_TIE ? (
          // A rank that hundreds share has no place on the track.
          <span className="font-game-ui text-[12px] leading-none whitespace-nowrap text-game-ink-500">
            {formatInt(tied)} tied
          </span>
        ) : null}
        {percentile !== undefined && tied <= MASS_TIE && (
          <span className="relative h-px w-full bg-game-ink-rule">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-game-ink-500"
                style={{ left: `${tick * 100}%` }}
              />
            ))}
            <span
              className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-game-ink-100"
              style={{ left: `${Math.min(1, Math.max(0, percentile)) * 100}%` }}
            />
          </span>
        )}
      </span>

      <span className="text-right font-game-num text-[12px] font-medium text-game-ink-100 tabular-nums">
        {exact !== undefined ? (
          <ExactValue
            exact={exact}
            shown={typeof value === "string" ? value : undefined}
            name={typeof label === "string" ? label : undefined}
          >
            {value}
          </ExactValue>
        ) : (
          value
        )}
        {denom !== undefined && <span className="text-game-ink-500"> / {denom}</span>}
      </span>

      {/* Rank — this country's standing for the metric among all countries. */}
      {unranked ? null : <Rank rank={rank} tied={tied} />}
    </div>
  );
}

/**
 * A band over a group of rows. The panel colour above it keeps the groups apart. With
 * an axis, the band labels the rank track under it where the track is, so no sentence
 * has to explain the marks.
 */
function Section({
  label,
  note,
  axis,
}: {
  label: string;
  note?: ReactNode;
  axis?: readonly { label: string; at: number }[];
}) {
  return (
    <div className="col-span-full bg-game-panel pt-2.5">
      {axis ? (
        <div className="grid h-7 grid-cols-[116px_minmax(0,1fr)_60px_44px] items-center gap-x-2.5 bg-game-panel-2 pr-8 pl-3.5 @max-[400px]/sg:grid-cols-[1fr_auto] @[560px]/sg:grid-cols-[150px_minmax(0,1fr)_64px_48px]">
          <span className={sectionLabel}>{label}</span>
          <span className="relative h-4 @max-[400px]/sg:hidden @[720px]/sg:hidden">
            {axis.map((tick) => (
              <span
                key={tick.label}
                className="absolute top-0 -translate-x-1/2 font-game-num text-[12px] leading-4 text-game-ink-500 tabular-nums last:-translate-x-full"
                style={{ left: `${tick.at * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </span>
          <span
            className={cx(sectionLabel, "text-right @max-[400px]/sg:hidden @[720px]/sg:hidden")}
          >
            Value
          </span>
          <span
            className={cx(sectionLabel, "text-right @max-[400px]/sg:hidden @[720px]/sg:hidden")}
          >
            Rank
          </span>
        </div>
      ) : (
        <div className="flex h-7 items-center justify-between gap-2 bg-game-panel-2 pr-8 pl-3.5">
          <span className={sectionLabel}>{label}</span>
          {note ? <span className="font-game-ui text-[12px] text-game-ink-500">{note}</span> : null}
        </div>
      )}
    </div>
  );
}

export interface StatRailProps {
  children: ReactNode;
}

export function StatRail({ children }: StatRailProps) {
  // The figures are one stop for Tab, and the arrow keys go from figure to figure.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("[data-rail-value]");
    if (first) first.tabIndex = 0;
  });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const values = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-rail-value]")];
    const at = values.indexOf(document.activeElement as HTMLElement);
    const next = values[at + (event.key === "ArrowDown" ? 1 : -1)];
    if (at < 0 || !next) return;
    event.preventDefault();
    values[at].tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  };
  return (
    <div ref={ref} onKeyDown={onKeyDown} className="@container/sg @container bg-game-panel">
      {/* One column by default, and 2 then 3 columns only in wide containers. */}
      <div className="flex flex-col @[720px]/sg:grid @[720px]/sg:grid-cols-2 @[720px]/sg:gap-x-6 @[1040px]/sg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

StatRail.Section = Section;
StatRail.Row = Row;
