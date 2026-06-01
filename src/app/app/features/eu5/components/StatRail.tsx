import type { ReactNode } from "react";
import { cx } from "class-variance-authority";

/**
 * StatRail — the EU5 "dense rail" stat display (Design Spec §10).
 *
 * A single dense, sectioned rail of metrics for entity profiles. Each row
 * carries only the pieces it has: a fixed icon slot, a label, an optional bar
 * (bounded ratios only), the value, an optional rank ordinal, and an optional
 * delta. The rail is narrow by default (one column) and reflows into 2 then 3
 * columns in wide containers via a container query — section headers always
 * span the full width and rows flow into as many columns as the container
 * affords, leaving ragged (never blank) tails.
 */

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

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
  /** Bounded ratio in [0, 1]. Omit for raw counts — the track stays empty. */
  bar?: number;
  /** 1-based ordinal rank within the rail's cohort (rendered ordinal-only). */
  rank?: number;
  /** Reserved for future use; not rendered today. */
  delta?: { value: string; dir: "up" | "down" | "flat" };
  icon?: ReactNode;
}

function Row({ label, value, denom, bar, rank, icon }: StatRailRowProps) {
  return (
    <div
      className={cx(
        "grid h-[30px] grid-cols-[16px_1fr_60px_76px_64px] items-center gap-x-1.5 border-b border-game-line bg-game-panel px-3",
        "last:border-b-0 hover:bg-game-panel-hover",
      )}
    >
      {icon ?? <IconSlot />}

      <span className="truncate font-game-ui text-[12px] text-game-ink-100">{label}</span>

      {/* Bar track — only painted for bounded ratios. */}
      <span className="flex items-center">
        {bar !== undefined && (
          <span className="relative h-1 w-full rounded-[1px] border border-game-line bg-game-panel-2">
            <span
              className="absolute inset-y-0 left-0 rounded-[1px] bg-game-ink-500"
              style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%` }}
            />
          </span>
        )}
      </span>

      <span className="text-right font-game-num text-[12px] text-game-ink-100 tabular-nums">
        {value}
        {denom !== undefined && <span className="text-game-ink-500"> / {denom}</span>}
      </span>

      {/* Rank ordinal — this country's standing for the metric among all countries.
          No `overflow-hidden` here: the superscript is raised above the line box
          and would otherwise be clipped. */}
      <span className="text-right font-game-num text-[10.5px] whitespace-nowrap text-game-ink-500">
        {rank !== undefined && (
          <>
            {rank}
            <sup className="text-[7.5px]">{ordinalSuffix(rank)}</sup>
          </>
        )}
      </span>
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

  return (
    <div
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
