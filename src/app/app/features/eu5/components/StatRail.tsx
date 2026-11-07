import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "class-variance-authority";
import { Tooltip } from "@/components/Tooltip";
import { formatInt } from "@/lib/format";
import { MASS_TIE, rankLabel } from "../stack/selection";
import { RailFigureName } from "./ExactValue";

/**
 * StatRail — the EU5 "dense rail" stat display (Design Spec §10).
 *
 * A single dense, sectioned rail of metrics for entity profiles. Each row
 * carries only the pieces it has: a fixed icon slot, a label, an optional mark
 * of its place in the cohort, the value, an optional rank, and an optional
 * delta. The rail is narrow by default (one column) and reflows into 2 then 3
 * columns in wide containers via a container query — section headers always
 * span the full width and rows flow into as many columns as the container
 * affords, leaving ragged (never blank) tails.
 */

/** Placeholder icon slot — reserved 16px square until the iconography pass ships. */
function IconSlot() {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 rounded-plate border border-game-line opacity-70"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--color-game-line-strong) 0 2px, transparent 2px 5px)",
        backgroundColor: "var(--color-game-panel-2)",
      }}
    />
  );
}

export interface StatRailRowProps {
  label: string;
  value: ReactNode;
  /** Dimmed denominator rendered after the value, e.g. `88 / 112`. */
  denom?: ReactNode;
  /**
   * Where the row stands among the cohort, from 0 to 1, as a dot on a thin rule. A
   * dot does not read as the length of the value, and it does not read as a slider.
   */
  percentile?: number;
  /** Positions on the same scale, as short dim ticks */
  ticks?: readonly number[];
  /** 1-based rank within the rail's cohort, as "#293". */
  rank?: number;
  /** How many countries share this rank, with this one */
  tied?: number;
  /** Reserved for future use; not rendered today. */
  delta?: { value: string; dir: "up" | "down" | "flat" };
  icon?: ReactNode;
  tooltip?: ReactNode;
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
  percentile,
  ticks = [],
  rank,
  tied = 1,
  icon,
  tooltip,
}: StatRailRowProps) {
  const labelNode = (
    <span
      className={cx(
        "truncate font-game-ui text-[12px] text-game-ink-100",
        tooltip &&
          "cursor-help underline decoration-game-ink-rule decoration-dotted underline-offset-2 hover:decoration-game-ink-100",
      )}
    >
      {label}
    </span>
  );

  return (
    <div
      className={cx(
        "grid h-[30px] grid-cols-[16px_1fr_60px_76px_64px] items-center gap-x-1.5 border-b border-game-line bg-game-panel px-3",
        "last:border-b-0 hover:bg-game-panel-hover",
      )}
    >
      {icon ?? <IconSlot />}

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

      <span className="flex items-center">
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

      <span className="text-right font-game-num text-[12px] text-game-ink-100 tabular-nums">
        <RailFigureName.Provider value={label}>{value}</RailFigureName.Provider>
        {denom !== undefined && <span className="text-game-ink-500"> / {denom}</span>}
      </span>

      {/* Rank — this country's standing for the metric among all countries. */}
      <Rank rank={rank} tied={tied} />
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div className="col-span-full border-t border-b border-game-line bg-game-panel-2 px-3 pt-2 pb-1 font-game-num text-[10px] tracking-[0.14em] text-game-ink-500 uppercase first:border-t-0">
      {label}
    </div>
  );
}

export interface StatRailProps {
  title: ReactNode;
  /** Right-aligned header note, e.g. the save date. */
  meta?: ReactNode;
  /** Size of the ranking cohort; surfaced once in the header (not per row). */
  cohort?: number;
  /** Keep the rail compact even in a wide layout. */
  narrow?: boolean;
  expand?: { label: string; onClick: () => void };
  children: ReactNode;
}

export function StatRail({ title, meta, cohort, narrow, expand, children }: StatRailProps) {
  const metaText = [meta, cohort !== undefined ? `${cohort} countries` : undefined]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .reduce<ReactNode[]>((acc, part, i) => {
      if (i > 0) acc.push(" · ");
      acc.push(part);
      return acc;
    }, []);

  // The figures are one stop for Tab, and the arrow keys go from figure to figure.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const values = [...(ref.current?.querySelectorAll<HTMLElement>("[data-rail-value]") ?? [])];
    if (values.length > 0 && values.every((value) => value.tabIndex !== 0)) {
      values[0].tabIndex = 0;
    }
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
    <div
      ref={ref}
      onKeyDown={onKeyDown}
      className={cx(
        "@container/sg @container overflow-hidden rounded-(--radius-panel) border border-game-line-strong bg-game-panel",
        narrow && "max-w-[480px]",
      )}
    >
      <div className="flex items-center justify-between border-b border-game-line px-3 py-2">
        <span className="font-game-num text-[11px] tracking-[0.14em] text-game-ink-500 uppercase">
          {title}
        </span>
        {metaText.length > 0 && (
          <span className="font-game-num text-[10.5px] text-game-ink-500">{metaText}</span>
        )}
      </div>

      {/* Single column by default; wraps to 2 then 3 columns only in genuinely
          wide containers (above the profile panel's max width, so the rail
          stays a single readable column there). The line-colored grid
          background + 1px column gap draws the vertical rules, so ragged
          (orphan) cells simply read as empty. */}
      <div className="flex flex-col @[720px]/sg:grid @[720px]/sg:grid-cols-2 @[720px]/sg:gap-x-px @[720px]/sg:bg-game-line @[1040px]/sg:grid-cols-3">
        {children}
      </div>

      {expand && (
        <button
          type="button"
          onClick={expand.onClick}
          className="flex w-full items-center justify-between border-t border-game-line bg-game-panel-2 px-3 py-2 font-game-ui text-[12px] text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100"
        >
          <span>{expand.label}</span>
          <span className="font-game-num text-game-ink-500">↓</span>
        </button>
      )}
    </div>
  );
}

StatRail.Section = Section;
StatRail.Row = Row;
