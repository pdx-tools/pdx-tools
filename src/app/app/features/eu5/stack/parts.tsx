import React from "react";
import { cx } from "class-variance-authority";
import ChevronDownIcon from "@heroicons/react/20/solid/ChevronDownIcon";
import ChevronLeftIcon from "@heroicons/react/20/solid/ChevronLeftIcon";
import ChevronRightIcon from "@heroicons/react/20/solid/ChevronRightIcon";
import ChevronUpIcon from "@heroicons/react/20/solid/ChevronUpIcon";
import PlusIcon from "@heroicons/react/16/solid/PlusIcon";
import { formatInt } from "@/lib/format";
import { focusRing, focusRingInset } from "@/components/game/focusRing";
import { sectionLabel } from "@/components/game/SectionTitle";
import { Tooltip } from "@/components/Tooltip";
import { divergingPoles } from "@/components/viz/echartsTheme";
import type { MapMode } from "@/wasm/wasm_eu5";
import { useEu5Engine, useEu5HomeCountry, useEu5MapMode, useEu5Players } from "../store";
import MapIcon from "@heroicons/react/16/solid/MapIcon";
import UserIcon from "@heroicons/react/16/solid/UserIcon";
import { DefinedTerm } from "../components/EntityName";
import { SortMark } from "../components/Eu5DataTable";

/**
 * The parts that every level of the column is built from. The names and
 * props follow `features/stack` on the HOI4 branch, so that the two shells
 * can become one by a rename.
 */

/** A color plate. The rim keeps a very dark game color visible, and the color does not change. */
export function Swatch({ color, size = 12 }: { color: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[2px]"
      style={{
        width: size,
        height: size,
        background: color ?? "transparent",
        boxShadow: color ? "inset 0 0 0 1px var(--game-rim)" : undefined,
      }}
    />
  );
}

/** The name of an icon button, shown on hover and on keyboard focus */
export function IconTip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "right";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Content side={side} className="text-xs">
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}

/**
 * A compact figure with its full value in a tooltip, on hover and on keyboard
 * focus. A figure that already is the full value needs no tooltip, so it adds
 * no tab stop.
 */
export function ExactValue({
  exact,
  shown,
  name,
  className,
  children,
}: {
  exact: string;
  /** The text that the figure shows, to compare with the full value */
  shown?: string;
  /** What the figure measures, for a reader who reaches it by keyboard */
  name?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (shown === exact) return <span className={className}>{children}</span>;
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span
          // A named figure is one of a rail, which has one stop. Arrow keys go through it.
          tabIndex={name ? -1 : 0}
          data-rail-value={name ? "" : undefined}
          aria-label={name ? `${name}: ${exact}` : undefined}
          className={cx("rounded-[1px]", focusRing, className)}
        >
          {children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="font-game-num text-xs tabular-nums">
        {exact}
      </Tooltip.Content>
    </Tooltip>
  );
}

/** The name of the human who plays a country in a multiplayer save */
export function usePlayerName(countryKey: number | undefined): string | undefined {
  const players = useEu5Players();
  if (players.length < 2) return undefined;
  return players.find((p) => p.countryIdx === countryKey)?.name;
}

/**
 * A level's way to paint the map with what the level is about. Once the map shows
 * it, the button has the on state and nothing to do.
 */
export function ShowOnMap({ mode, label }: { mode: MapMode; label: string }) {
  const engine = useEu5Engine();
  const on = useEu5MapMode() === mode;
  return (
    <button
      type="button"
      disabled={on}
      onClick={() => void engine.trigger.selectMapMode(mode)}
      className={cx(
        "mr-1 flex h-6 shrink-0 items-center gap-1 rounded-control border px-1.5 font-game-ui text-[12px] transition-colors max-md:h-11",
        on
          ? "border-transparent bg-game-accent-soft text-game-accent-100"
          : "border-game-line-strong text-game-ink-100 hover:bg-game-panel-hover",
        focusRing,
      )}
    >
      <MapIcon aria-hidden className="h-3.5 w-3.5" />
      {on ? `Map shows ${label}` : `Show ${label} on map`}
    </button>
  );
}

/** The sign that a figure can paint the map */
export function MapGlyph({ className }: { className?: string }) {
  return (
    <MapIcon
      aria-hidden
      className={cx("inline h-3.5 w-3.5 shrink-0 align-[-3px] text-game-ink-300", className)}
    />
  );
}

/**
 * The label of a figure that a map mode can show. A click paints the map with the
 * figure, and the figure that the map shows now is in brass, so the table and the
 * map read as one tool.
 */
export function MapModeLabel({ mode, label }: { mode: MapMode; label: string }) {
  const engine = useEu5Engine();
  const on = useEu5MapMode() === mode;
  return (
    <IconTip
      side="right"
      label={on ? `The map shows ${label.toLowerCase()}` : `Show ${label.toLowerCase()} on the map`}
    >
      <button
        type="button"
        aria-pressed={on}
        onClick={() => void engine.trigger.selectMapMode(mode)}
        className={cx(
          "inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-[2px] font-game-ui text-[12px] max-md:min-h-11",
          on ? "font-medium text-game-accent-100" : "text-game-ink-100 hover:underline",
          focusRing,
        )}
      >
        {label}
        <MapGlyph className={on ? "text-game-accent-100" : undefined} />
      </button>
    </IconTip>
  );
}

/**
 * Says which row is a human's. In single player one row has it, so a word can
 * stand out: "You". In a multiplayer save most rows have it, and a mark on every
 * row carries no signal. So there it is a small quiet glyph, which gives the name
 * and the tag their room, and the pointer gets who plays the country.
 */
export function PlayerTag({ className, countryKey }: { className?: string; countryKey?: number }) {
  const multiplayer = useEu5Players().length > 1;
  const name = usePlayerName(countryKey);
  const home = useEu5HomeCountry();
  if (multiplayer) {
    const label = name ? `Played by ${name}` : "Played by a human";
    return (
      <span title={label} className={cx("shrink-0 text-game-ink-300", className)}>
        <UserIcon aria-hidden className="h-3 w-3" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span
      className={cx(
        // A tinted fill and no border, because a border means a button.
        "shrink-0 rounded-plate bg-game-panel-active px-1 font-game-num text-[12px] leading-[16px] text-game-ink-100",
        className,
      )}
      title={
        home?.kind === "viewpoint"
          ? "The save was written while viewing this country. It lists no human player."
          : undefined
      }
    >
      {home?.kind === "viewpoint" ? "Observing" : "You"}
    </span>
  );
}

/**
 * A bar that goes out from a centre mark, as a number line does: a shortage is
 * negative and goes to the left, and a surplus is positive and goes to the
 * right. The fractions are relative to the largest imbalance of the list. Each
 * width has the same track.
 */
export function DivergingBar({ surplus, shortage }: { surplus: number; shortage: number }) {
  const half = "flex h-1.5 overflow-hidden bg-game-track";
  return (
    <span aria-hidden className="relative grid grid-cols-2 items-center">
      <span className={cx(half, "justify-end rounded-l-[2px]")}>
        {shortage > 0 ? (
          <span
            className="block h-full"
            style={{ width: `${shortage * 100}%`, minWidth: 2, background: divergingPoles.warm }}
          />
        ) : null}
      </span>
      <span className={cx(half, "rounded-r-[2px]")}>
        {surplus > 0 ? (
          <span
            className="block h-full"
            style={{ width: `${surplus * 100}%`, minWidth: 2, background: divergingPoles.cool }}
          />
        ) : null}
      </span>
      {/* The centre mark is the zero of the scale. */}
      <span className="absolute top-1/2 left-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-game-ink-300" />
    </span>
  );
}

/**
 * The one label over a diverging bar: "Shortage | Surplus", with the rule on the
 * zero line. It goes past the ends of a short bar. The signed values say that
 * they are the imbalance, so the value column has no label.
 */
export function DivergingHead() {
  return (
    <span aria-label="Shortage on the left, surplus on the right" className="relative block h-3.5">
      <span className={cx(sectionLabel, "absolute right-1/2 mr-1.5 whitespace-nowrap")}>
        Shortage
      </span>
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-game-ink-500" />
      <span className={cx(sectionLabel, "absolute left-1/2 ml-1.5 whitespace-nowrap")}>
        Surplus
      </span>
    </span>
  );
}

export type Crumb = { key: string; label: string };

/**
 * How deep the reader is: only the levels. The map row names the mode and the
 * strip names the selection. The back chevron goes up one level, as Esc does. A
 * long path collapses its middle.
 */
export function StackCrumbs({
  crumbs,
  here,
  onPop,
  onBack,
  action,
}: {
  /** The levels above the open one, outermost first */
  crumbs: Crumb[];
  /** The open level */
  here: string;
  /** Go back to the level at this index of `crumbs` */
  onPop: (index: number) => void;
  /** Go up one level */
  onBack: () => void;
  action?: React.ReactNode;
}) {
  const shown = crumbs.map((x, index) => ({ ...x, index }));
  const collapsed = shown.length > 2;
  const visible = collapsed ? [shown[0], shown[shown.length - 1]] : shown;
  const crumbButton = cx(
    "h-6 shrink-0 rounded-[2px] px-1.5 text-[12px] text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100 max-md:h-11",
    focusRing,
  );
  const sep = <ChevronRightIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-game-ink-700" />;

  return (
    <nav
      aria-label="Where you are"
      className="flex h-8 shrink-0 items-center gap-0.5 overflow-hidden border-b border-game-line pr-1.5 pl-2 whitespace-nowrap max-md:h-11 max-md:pr-0 max-md:pl-0"
    >
      <IconTip label="Back (Esc)">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={cx(
            "grid h-6 w-6 shrink-0 place-items-center rounded-control text-game-ink-500 hover:bg-game-panel-hover hover:text-game-ink-100 max-md:h-11 max-md:w-11",
            focusRing,
          )}
        >
          <ChevronLeftIcon aria-hidden className="h-4 w-4" />
        </button>
      </IconTip>
      {visible.map((crumb, i) => (
        <React.Fragment key={crumb.key}>
          {i > 0 ? sep : null}
          {collapsed && i === 1 ? (
            <>
              <span className="shrink-0 px-0.5 text-[12px] text-game-ink-500" aria-hidden>
                …
              </span>
              {sep}
            </>
          ) : null}
          <button type="button" className={crumbButton} onClick={() => onPop(crumb.index)}>
            {crumb.label}
          </button>
        </React.Fragment>
      ))}
      {visible.length > 0 ? sep : null}
      <span
        aria-current="page"
        className="min-w-0 px-1.5 text-[12px] font-medium text-game-ink-100"
      >
        {here}
      </span>
      {action ? <span className="ml-auto flex shrink-0 items-center gap-1">{action}</span> : null}
    </nav>
  );
}

/** The identity of a level: its plate, its name, and its tag */
export function LevelTitle({
  swatch,
  title,
  tag,
  aside,
}: {
  swatch?: string | null;
  title: React.ReactNode;
  tag?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-game-line px-3.5 py-3.5">
      {swatch !== undefined ? <Swatch color={swatch} size={16} /> : null}
      <h2 className="min-w-0 flex-1 text-[17px] leading-tight font-medium text-balance text-game-ink-100">
        {title}
      </h2>
      {tag ? <span className="font-game-num text-[12px] text-game-ink-500">{tag}</span> : null}
      {aside}
    </div>
  );
}

/** A section band inside a level, with optional column labels on the right */
export function Band({
  label,
  columns,
  sorted = false,
  order,
  flush = false,
}: {
  label: string;
  columns?: string;
  /** The rows are in the order of this column, from the largest */
  sorted?: boolean;
  /** The order of the rows, when the reader can turn it round */
  order?: { direction: "asc" | "desc"; onToggle: () => void };
  /** The band is the first in its level, so no group is above it to stand apart from */
  flush?: boolean;
}) {
  return (
    <div className={cx(!flush && "mt-2.5")}>
      <div
        className={cx(rowEnd, "flex h-7 items-center justify-between gap-2 bg-game-panel-2 pl-3.5")}
      >
        {/* The label stays in view when a table under the band scrolls sideways. */}
        <span className={cx(sectionLabel, "sticky left-3.5")}>{label}</span>
        {columns && order ? (
          <button
            type="button"
            onClick={order.onToggle}
            aria-label={`Sort by ${columns}, ${order.direction === "desc" ? "lowest first" : "highest first"}`}
            className={cx(
              sectionLabel,
              "relative inline-flex cursor-pointer items-center gap-1 rounded-[2px] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] hover:text-game-ink-100 max-md:min-h-11",
              focusRing,
            )}
          >
            {columns}
            <SortMark sorted={order.direction} />
          </button>
        ) : columns ? (
          <span className={cx(sectionLabel, "inline-flex items-center gap-1")}>
            <DefinedTerm label={columns} />
            {sorted ? <SortMark sorted="desc" /> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The lead of a level: one line, computed from the data, that says what the level shows */
export function Finding({
  children,
  aside,
}: {
  children: React.ReactNode;
  /** A control that changes what the line says */
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-game-line px-3.5 py-3">
      <p className="min-w-0 text-[17px] leading-snug font-medium text-balance text-game-ink-100">
        {children}
      </p>
      {aside ? <span className="shrink-0">{aside}</span> : null}
    </div>
  );
}

/** A quiet line that explains what the reader sees */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-game-line px-3.5 py-2 text-[12px] leading-snug text-game-ink-500">
      {children}
    </p>
  );
}

/** The end of a capped list. It shows when the list has more rows or the reader asked for them. */
export function ShowMoreRow({
  hidden,
  expanded,
  onToggle,
}: {
  hidden: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (hidden === 0 && !expanded) return null;
  const Icon = expanded ? ChevronUpIcon : ChevronDownIcon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cx(
        "flex h-[30px] w-full items-center gap-1 border-b border-game-line-faint px-3.5 text-left text-[12px] text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100 max-md:h-11",
        focusRingInset,
      )}
    >
      {expanded ? "Show fewer" : `Show ${formatInt(hidden)} more`}
      <Icon aria-hidden className="h-3.5 w-3.5" />
    </button>
  );
}

/** The rank, as the column shows it: "#293" on the baseline */
export const formatRank = (rank: number) => `#${formatInt(rank)}`;

/**
 * The end of each row and band: the chevron's slot, then the 14px gutter. Each
 * list reserves this slot, also a list with no chevron, so the values and the
 * column labels of all lists end on one line.
 */
export const rowEnd = "pr-8 max-md:pr-11";

/**
 * The row template of every list in the column: the mark slot, the name, the
 * 64px bar, the value, and the end slot. A group with no mark has no mark slot,
 * so its names start on the 14px gutter with the band's label. A row without a
 * mark in a group with marks keeps the slot empty. The other slots have one width,
 * so the bar and the value do not move when the mode changes. A rank is in the slot
 * of the bar. A list with two figures has no bar: a long tail makes it a sliver,
 * and the name keeps the room. A row has a faint rule, so that the space above a
 * band separates the groups.
 */
export const rowClass =
  "relative grid min-h-[30px] w-full items-center gap-2.5 border-b border-game-line-faint pl-3.5 pr-8 text-left max-md:min-h-11 max-md:pr-11";

export const MARK_SLOT = "16px";

export function rowColumns(slots: {
  /** No row of the group has a mark, so the group has no mark slot */
  flush?: boolean;
  /** The slot of the bar or the rank. It is narrower in a row with two figures. */
  bar?: boolean;
  value?: boolean;
  /** The value is a word, such as a terrain, so it has the width that it needs */
  word?: boolean;
  dim?: boolean;
}): string {
  return [
    slots.flush ? null : MARK_SLOT,
    "minmax(0,1fr)",
    slots.bar ? (slots.dim ? "32px" : "64px") : null,
    slots.value ? (slots.word ? "minmax(56px,max-content)" : "56px") : null,
    slots.dim ? "40px" : null,
  ]
    .filter((x) => x !== null)
    .join(" ");
}

/**
 * The sign that a row opens a level, and nothing else. The arrow head ends on
 * the 14px gutter line, in line with × and the other icons at the column's end.
 */
export function RowChevron({ className }: { className?: string }) {
  return (
    <ChevronRightIcon
      aria-hidden
      className={cx(
        "absolute top-1/2 right-[9px] h-3.5 w-3.5 -translate-y-1/2 text-game-ink-300 group-hover:text-game-ink-100",
        className,
      )}
    />
  );
}

/** The sign that a row expands in place. It turns when the row is open. */
export function RowCaret({ open }: { open: boolean }) {
  return (
    <ChevronDownIcon
      aria-hidden
      className={cx(
        "absolute top-1/2 right-[9px] h-3.5 w-3.5 -translate-y-1/2 text-game-ink-300 transition-transform duration-100 group-hover:text-game-ink-100 motion-reduce:transition-none",
        open && "rotate-180",
      )}
    />
  );
}

/** A figure with its unit, in the one secondary stat style of each level */
export function Stat({ value, label }: { value: string; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-game-num text-[12px] font-medium text-game-ink-100 tabular-nums">
        {value}
      </span>
      {label ? <span className="font-game-ui text-[12px] text-game-ink-300">{label}</span> : null}
    </span>
  );
}

/**
 * Add a country to the selection: a quiet outlined button, on one line, in one
 * place in each state. It does not take brass, because brass is for the selection
 * and for an active state.
 */
export function AddCountryButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <IconTip label={title}>
      <button
        type="button"
        onClick={onClick}
        className={cx(
          "flex h-6 shrink-0 items-center gap-0.5 rounded-control border border-game-line-strong px-1.5 font-game-ui text-[12px] leading-none whitespace-nowrap text-game-ink-100 transition-colors hover:bg-game-panel-hover",
          // On a phone the target goes to 44px.
          "max-md:relative max-md:h-9 max-md:before:absolute max-md:before:inset-x-0 max-md:before:-inset-y-[5px]",
          focusRing,
        )}
      >
        <PlusIcon aria-hidden className="h-3 w-3" />
        Add
      </button>
    </IconTip>
  );
}

/**
 * A compact figure. The K, M or B hangs in a slot of its own, so that the digits
 * of figures with and without a suffix stay in one column.
 */
export function Figure({ children }: { children: string }) {
  const match = /^(.*\d)([KMB])$/.exec(children);
  return (
    <>
      {match ? match[1] : children}
      <span
        className={cx("inline-block w-[1ch] text-left", !match && "invisible")}
        aria-hidden={!match}
      >
        {match ? match[2] : "K"}
      </span>
    </>
  );
}

export type RowProps = {
  name: React.ReactNode;
  tag?: string;
  value?: React.ReactNode;
  dim?: React.ReactNode;
  /** Opens a level. Without it the row is a plain line, with no chevron and no hover. */
  onOpen?: () => void;
  hot?: boolean;
  onHover?: (hovering: boolean) => void;
};

/**
 * One line of a list, with no mark, so its name starts on the 14px gutter. A row that opens a level is a button; the map lights
 * its land while the pointer is over it.
 */
export function Row({ name, tag, value, dim, onOpen, hot, onHover }: RowProps) {
  const hasValue = value !== undefined;
  const hasDim = dim !== undefined;
  const content = (
    <>
      <span className="min-w-0 truncate text-[12.5px] text-game-ink-100">
        {name}
        {tag ? (
          <span className="ml-1.5 font-game-ui text-[12px] text-game-ink-500">{tag}</span>
        ) : null}
      </span>
      {hasValue ? (
        <span className="text-right font-game-num text-[12px] font-medium text-game-ink-100 tabular-nums">
          {value}
        </span>
      ) : null}
      {hasDim ? (
        <span className="text-right font-game-num text-[12px] text-game-ink-500 tabular-nums">
          {dim}
        </span>
      ) : null}
      {onOpen ? <RowChevron /> : null}
    </>
  );

  const className = cx("group", rowClass, hot && "bg-game-panel-hover");
  const grid: React.CSSProperties = {
    gridTemplateColumns: rowColumns({ flush: true, value: hasValue, word: true, dim: hasDim }),
  };
  const hover = onHover
    ? { onPointerEnter: () => onHover(true), onPointerLeave: () => onHover(false) }
    : {};

  if (!onOpen) {
    return (
      <div className={className} style={grid} {...hover}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-row-key={name}
      className={cx(className, "cursor-pointer hover:bg-game-panel-hover", focusRingInset)}
      style={grid}
      onClick={onOpen}
      onFocus={onHover ? () => onHover(true) : undefined}
      onBlur={onHover ? () => onHover(false) : undefined}
      {...hover}
    >
      {content}
    </button>
  );
}
