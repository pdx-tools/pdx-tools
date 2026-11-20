import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { Popover } from "@/components/Popover";
import { Table } from "@/components/Table";
import { isDarkMode } from "@/lib/dark";
import { MONTH_ABBR, dayNumber, formatLongDate, parseDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { Flag } from "@/features/eu4/components/avatars";
import type { BySaveFigure } from "./figures";
import {
  fittedScale,
  nearestSave,
  needsRim,
  referenceValue,
  stripGeometry,
} from "./ledgerGeometry";
import type { StripGeometry } from "./ledgerGeometry";
import { amount, heldIndex, nearestTags, rowTag, switchYear } from "./model";
import type { BySaveRow, CountryInfo } from "./model";
import { timeTicks } from "./timeTicks";

const muted = "text-gray-600 dark:text-gray-300";
const faint = "text-gray-500 dark:text-gray-400";
/** The ink of the rules and of the edge on the read strokes. */
const ink = { light: "#0f172a", dark: "#f1f5f9" };
/** The world total's mark: the app's accent, not a country's color. */
const accent = { light: "#0284c7", dark: "#38bdf8" };

/** One save's mark in a row: its value and the game color of the tag held then. */
type Mark = { value: number; color: string };

type Layout = {
  narrow: boolean;
  dense: boolean;
  rowHeight: number;
  flag: "xs" | "small";
};

function layoutFor(width: number, rows: number, world: boolean): Layout {
  const narrow = width < 600;
  const dense = rows > 12;
  const rowHeight = world ? (narrow ? 180 : 220) : dense ? 44 : narrow ? 54 : 64;
  return { narrow, dense, rowHeight, flag: dense || narrow ? "xs" : "small" };
}

/** The widths of the name, scale label and value columns; the strip takes the rest. */
function columnsFor(layout: Layout, world: boolean) {
  if (world) return { id: 0, scale: layout.narrow ? 34 : 44, value: layout.narrow ? 88 : 112 };
  return layout.narrow ? { id: 148, scale: 26, value: 46 } : { id: 172, scale: 34, value: 62 };
}

export type LedgerProps = {
  columns: readonly AnalysisSave[];
  /** The rows in their shown order. */
  rows: readonly BySaveRow[];
  /** Every row of the figure, for the shared scale. */
  allRows: readonly BySaveRow[];
  selected: number;
  hovered: number | null;
  /** The open save's column, or -1. */
  openColumn: number;
  figure: BySaveFigure;
  names: ReadonlyMap<string, CountryInfo>;
  /** The world total: one row of dots on a fitted scale. */
  world: boolean;
  /** The row whose level the other rows carry, while it is hovered or focused. */
  emphasized: string | null;
  /** The row under the pointer, and the row whose name has keyboard focus. */
  onPointerEmphasis: (key: string | null) => void;
  onFocusEmphasis: (key: string | null) => void;
  onHover: (column: number | null) => void;
  onPick: (column: number) => void;
  /** The heading over the ruler; it stays in view while the rows scroll. */
  header: ReactNode;
};

/**
 * Each country as a row: its flag and name, one thin stroke per save at the
 * save's date on one zero-based scale, and its value at the shown save.
 * Nothing is drawn between saves.
 */
export function BySaveLedger({
  columns,
  rows,
  allRows,
  selected,
  hovered,
  openColumn,
  figure,
  names,
  world,
  emphasized,
  onPointerEmphasis,
  onFocusEmphasis,
  onHover,
  onPick,
  header,
}: LedgerProps) {
  const dark = isDarkMode();
  const shown = hovered ?? selected;
  const wrapper = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ ledger: 768, strip: 500 });
  useLayoutEffect(() => {
    const measure = () => {
      const ledger = wrapper.current?.clientWidth ?? 768;
      const width = strip.current?.clientWidth ?? 500;
      setSize((x) => (x.ledger === ledger && x.strip === width ? x : { ledger, strip: width }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapper.current) observer.observe(wrapper.current);
    if (strip.current) observer.observe(strip.current);
    return () => observer.disconnect();
  }, []);
  // Row height follows every lineage of the figure, so a row that joins while hovering moves nothing.
  const layout = layoutFor(size.ledger, allRows.length, world);
  const widths = columnsFor(layout, world);

  const days = useMemo(() => columns.map((x) => dayNumber(x.date)), [columns]);
  const geometry = useStripGeometry(days, size.strip, selected);

  // Each row's marks, one per save, built once per data and not per pointer move.
  const marks = useMemo(() => {
    const result = new Map<string, (Mark | null)[]>();
    for (const row of allRows) {
      result.set(
        row.key,
        row.cells.map((cell) => {
          const value = amount(cell);
          if (value === null || !cell) return null;
          const color = world
            ? dark
              ? accent.dark
              : accent.light
            : (names.get(cell.tag)?.color ?? "#808080");
          return { value, color };
        }),
      );
    }
    return result;
  }, [allRows, names, world, dark]);

  const scale = useMemo(() => {
    const values = [...marks.values()].flatMap((x) => x.flatMap((m) => (m ? [m.value] : [])));
    if (world) {
      const fitted = fittedScale(values);
      return { lo: fitted.lo, hi: fitted.hi, refs: fitted.steps };
    }
    const hi = Math.max(1, ...values);
    return { lo: 0, hi, refs: [referenceValue(hi)] };
  }, [marks, world]);

  const ticks = useMemo(() => timeTicks(geometry.from, geometry.to, 0), [geometry]);
  const tickGap =
    ticks.ticks.length > 1
      ? geometry.xDay(ticks.ticks[1]) - geometry.xDay(ticks.ticks[0])
      : Infinity;
  // Every other label when the widest one would not fit between ticks.
  const widest = Math.max(0, ...ticks.ticks.map((day) => ticks.label(day).length)) * 7 + 8;
  const labelEvery = tickGap < widest ? Math.ceil(widest / Math.max(1, tickGap)) : 1;

  const pointerSave = (clientX: number) => {
    const box = strip.current?.getBoundingClientRect();
    if (!box) return null;
    const px = clientX - box.left;
    if (px < -6 || px > box.width + 6) return null;
    return nearestSave(geometry, px);
  };

  const emphasizedMarks = emphasized ? (marks.get(emphasized) ?? null) : null;
  const style = {
    "--c-id": `${widths.id}px`,
    "--c-scale": `${widths.scale}px`,
    "--c-val": `${widths.value}px`,
  } as React.CSSProperties;
  const grid = "grid grid-cols-[var(--c-id)_var(--c-scale)_minmax(0,1fr)_var(--c-val)]";
  const centerOf = (i: number) => Math.floor(geometry.x[i] + geometry.bar / 2) + 0.5;

  return (
    <div ref={wrapper} style={style} className="relative">
      {/* The heading and the ruler stay in view while a long list scrolls. */}
      <div className="sticky -top-6 z-10 -mx-4 border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-slate-900">
        {header}
        <div className={cx(grid, "mt-2 h-9")} aria-hidden>
          <div />
          <div />
          <div ref={strip} className="relative">
            <svg width={size.strip} height={36} className="block overflow-visible">
              {ticks.ticks.map((day, i) => {
                const x = Math.round(geometry.xDay(day) + geometry.bar / 2) + 0.5;
                // Every other label when they would crowd each other.
                const labeled = labelEvery === 1 || i % labelEvery === 0;
                return (
                  <g key={day}>
                    <line
                      x1={x}
                      x2={x}
                      y1={17}
                      y2={21}
                      className="stroke-gray-300 dark:stroke-gray-600"
                    />
                    <text
                      x={x}
                      y={12}
                      textAnchor="middle"
                      className={cx("fill-current text-xs", faint)}
                    >
                      {labeled ? ticks.label(day) : ""}
                    </text>
                  </g>
                );
              })}
              <rect
                x={centerOf(selected) - 2.5}
                y={26}
                width={5}
                height={5}
                fill={dark ? ink.dark : ink.light}
              />
              <rect
                x={centerOf(selected) - 0.5}
                y={31}
                width={1}
                height={5}
                fill={dark ? ink.dark : ink.light}
              />
              {hovered !== null && hovered !== selected && (
                <rect
                  x={centerOf(hovered) - 0.5}
                  y={26}
                  width={1}
                  height={10}
                  opacity={0.4}
                  fill={dark ? ink.dark : ink.light}
                />
              )}
              {openColumn >= 0 &&
                openColumn !== selected &&
                !Number.isNaN(geometry.x[openColumn]) && (
                  <text
                    x={centerOf(openColumn) > size.strip - 24 ? size.strip : centerOf(openColumn)}
                    y={32}
                    textAnchor={centerOf(openColumn) > size.strip - 24 ? "end" : "middle"}
                    className={cx("fill-current text-[11px] font-semibold", muted)}
                  >
                    Open
                  </text>
                )}
            </svg>
          </div>
          <div />
        </div>
      </div>
      <div
        className="cursor-pointer"
        onPointerMove={(event) => {
          if ((event.target as Element).closest("[data-no-pick]")) return;
          onHover(pointerSave(event.clientX));
        }}
        onPointerLeave={() => onHover(null)}
        onClick={(event) => {
          if ((event.target as Element).closest("[data-no-pick]")) return;
          const at = pointerSave(event.clientX);
          if (at !== null) onPick(at);
        }}
      >
        <Table size="compact" overflow={false} className="table-fixed">
          <colgroup>
            <col style={{ width: widths.id }} />
            <col style={{ width: widths.scale }} />
            <col />
            <col style={{ width: widths.value }} />
          </colgroup>
          <thead className="sr-only">
            <tr>
              <th scope="col">Country</th>
              <th scope="col">Scale</th>
              <th scope="col">Values by save</th>
              <th scope="col">{formatLongDate(columns[shown].date)}</th>
            </tr>
          </thead>
          <Table.Body>
            {rows.map((row, index) => (
              <LedgerRow
                key={row.key}
                row={row}
                marks={marks.get(row.key) ?? []}
                carried={emphasized && emphasized !== row.key ? emphasizedMarks : null}
                faded={emphasized !== null && emphasized !== row.key}
                emphasized={emphasized === row.key}
                columns={columns}
                selected={selected}
                hovered={hovered}
                openColumn={openColumn}
                geometry={geometry}
                width={size.strip}
                layout={layout}
                scale={scale}
                label={world || index === 0 || layout.dense}
                figure={figure}
                names={names}
                world={world}
                dark={dark}
                onPointerEmphasis={onPointerEmphasis}
                onFocusEmphasis={onFocusEmphasis}
              />
            ))}
          </Table.Body>
        </Table>
      </div>
    </div>
  );
}

type Scale = { lo: number; hi: number; refs: number[] };

/** The y of a value in a row of a height: zero-based for countries, fitted for the world. */
function yOf(scale: Scale, height: number, world: boolean) {
  const top = world ? 22 : Math.round(height * 0.17);
  const foot = world ? 18 : 0;
  return (value: number) =>
    top + (1 - (value - scale.lo) / (scale.hi - scale.lo || 1)) * (height - top - foot);
}

/**
 * The strip's geometry. It changes with the data and the width; with a run
 * of saves, only when the selection leaves the run.
 */
function useStripGeometry(days: readonly number[], width: number, selected: number) {
  const [anchor, setAnchor] = useState(selected);
  const geometry = useMemo(() => stripGeometry(days, width, anchor), [days, width, anchor]);
  // Move the run only when the selection leaves it.
  if ((selected < geometry.first || selected > geometry.last) && anchor !== selected)
    setAnchor(selected);
  return geometry;
}

function LedgerRow({
  row,
  marks,
  carried,
  faded,
  emphasized,
  columns,
  selected,
  hovered,
  openColumn,
  geometry,
  width,
  layout,
  scale,
  label,
  figure,
  names,
  world,
  dark,
  onPointerEmphasis,
  onFocusEmphasis,
}: {
  row: BySaveRow;
  marks: readonly (Mark | null)[];
  carried: readonly (Mark | null)[] | null;
  faded: boolean;
  emphasized: boolean;
  columns: readonly AnalysisSave[];
  selected: number;
  hovered: number | null;
  openColumn: number;
  geometry: StripGeometry;
  width: number;
  layout: Layout;
  scale: Scale;
  label: boolean;
  figure: BySaveFigure;
  names: ReadonlyMap<string, CountryInfo>;
  world: boolean;
  dark: boolean;
  onPointerEmphasis: (key: string | null) => void;
  onFocusEmphasis: (key: string | null) => void;
}) {
  const shown = hovered ?? selected;
  const height = layout.rowHeight;
  const y = yOf(scale, height, world);
  const cell = row.cells[shown];
  const value = amount(cell);
  const emphasize = world
    ? {}
    : {
        onPointerEnter: () => onPointerEmphasis(row.key),
        onPointerLeave: () => onPointerEmphasis(null),
      };
  return (
    <Table.Row
      className={cx(
        "border-gray-200 dark:border-gray-700",
        emphasized
          ? "bg-gray-200/50 hover:bg-gray-200/50 dark:bg-gray-600/40 dark:hover:bg-gray-600/40"
          : "hover:bg-transparent dark:hover:bg-transparent",
        world && "border-0",
      )}
      style={{ height }}
    >
      <th scope="row" className="p-0 text-left font-normal" {...emphasize}>
        {!world && (
          <RowName
            row={row}
            shown={shown}
            selected={selected}
            names={names}
            layout={layout}
            onFocusChange={(focused) => onFocusEmphasis(focused ? row.key : null)}
          />
        )}
        {world && <span className="sr-only">{figure.title}</span>}
        <span className="sr-only">{historyText(row, columns, figure)}</span>
      </th>
      <td aria-hidden className="relative p-0">
        {label &&
          scale.refs.map((ref) => (
            <span
              key={ref}
              className={cx(
                "absolute right-1.5 -translate-y-1/2 tabular-nums",
                faint,
                world ? "text-xs" : "text-[10px] leading-[10px]",
              )}
              style={{ top: Math.round(y(ref)) }}
            >
              {scaleLabel(ref, scale, world, figure)}
            </span>
          ))}
      </td>
      <td aria-hidden className="p-0">
        <div className="relative" style={{ height }}>
          {/* Only the strokes fade; the rules and the carried beads stay. */}
          <div className="transition-opacity duration-150" style={{ opacity: faded ? 0.45 : 1 }}>
            <Strip
              marks={marks}
              geometry={geometry}
              width={width}
              height={height}
              scale={scale}
              world={world}
              dark={dark}
            />
          </div>
          <svg
            width={width}
            height={height}
            className="pointer-events-none absolute inset-0 overflow-visible"
          >
            <Rules
              geometry={geometry}
              height={height}
              selected={selected}
              hovered={hovered}
              openColumn={openColumn}
              dark={dark}
            />
            <ReadMarks
              marks={marks}
              geometry={geometry}
              height={height}
              y={y}
              selected={selected}
              hovered={hovered}
              world={world}
              dark={dark}
            />
            {carried && geometry.beads && (
              <Beads marks={carried} own={marks} geometry={geometry} height={height} y={y} />
            )}
          </svg>
        </div>
      </td>
      <Table.Cell
        className={cx(
          "p-0 text-right tabular-nums",
          world
            ? cx("align-top font-bold", layout.narrow ? "text-2xl" : "text-[32px] leading-9")
            : cx("font-medium", layout.dense || layout.narrow ? "text-[17px]" : "text-xl"),
        )}
        {...emphasize}
      >
        {world ? (
          value !== null && (
            <span
              className="block"
              style={{ paddingTop: Math.max(0, Math.min(height - 36, y(value) - 18)) }}
            >
              {figure.format(value)}
            </span>
          )
        ) : value !== null ? (
          figure.format(value)
        ) : cell ? (
          <span className={muted} title="The save has no record of this country.">
            –
          </span>
        ) : null}
      </Table.Cell>
    </Table.Row>
  );
}

/** A reference line's label, precise enough that distinct lines read apart. */
function scaleLabel(ref: number, scale: Scale, world: boolean, figure: BySaveFigure) {
  if (!world) return ref >= 10 ? figure.format(ref) : String(ref);
  const step = scale.refs.length > 1 ? scale.refs[1] - scale.refs[0] : 1000;
  if (step < 100) return Math.round(ref).toLocaleString("en-US");
  const digits = step >= 1000 ? 0 : 1;
  return `${(ref / 1000).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}K`;
}

/** What a row's strip shows, in words, for assistive technology. */
function historyText(row: BySaveRow, columns: readonly AnalysisSave[], figure: BySaveFigure) {
  const values = row.cells.flatMap((cell, i) => {
    const value = amount(cell);
    return value === null ? [] : [{ value, year: columns[i].date.year }];
  });
  if (!values.length) return "";
  const first = values[0];
  const last = values[values.length - 1];
  return `, ${values.length} ${values.length === 1 ? "save" : "saves"} with values, ${figure.format(first.value)} in ${first.year} to ${figure.format(last.value)} in ${last.year}`;
}

/**
 * The country's flag and name as the shown save has them, and its other
 * tags. Focus emphasizes the row; a click opens nothing, so reading the
 * chart never leaves it.
 */
function RowName({
  row,
  shown,
  selected,
  names,
  layout,
  onFocusChange,
}: {
  row: BySaveRow;
  shown: number;
  selected: number;
  names: ReadonlyMap<string, CountryInfo>;
  layout: Layout;
  onFocusChange: (focused: boolean) => void;
}) {
  const tag = rowTag(row, shown, selected);
  const name = names.get(tag)?.name ?? tag;
  const { near, more } = nearestTags(row, shown, selected);
  const earlier = row.lineage?.kind === "earlierHolder";
  return (
    <div
      tabIndex={0}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      className="flex min-w-0 items-center gap-2.5 rounded-sm pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
    >
      <Flag tag={tag} name={name}>
        <Flag.Image size={layout.flag} />
      </Flag>
      <span className="flex min-w-0 flex-col">
        <span
          className={cx(
            "truncate font-medium",
            layout.narrow || layout.dense ? "text-sm" : "text-[15px] leading-5",
          )}
        >
          {name}
          {earlier && (
            <span className={cx("ml-1 text-xs font-normal", muted)}>(earlier country)</span>
          )}
        </span>
        {near.length > 0 && (
          <span className={cx("flex min-w-0 items-center gap-1 text-xs leading-4", muted)}>
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {near.map((other, i) => (
                <span
                  key={`${other.tag}${other.from}`}
                  className="flex min-w-0 shrink-0 items-center gap-1 first:shrink"
                  title={
                    other.relation === "was"
                      ? `${names.get(other.tag)?.name ?? other.tag} until ${switchYear(other.until)}`
                      : `${names.get(other.tag)?.name ?? other.tag} from ${switchYear(other.from)}`
                  }
                >
                  {(i === 0 || near[i - 1].relation !== other.relation) && (
                    <span>{other.relation}</span>
                  )}
                  <Flag tag={other.tag} name={names.get(other.tag)?.name ?? other.tag}>
                    <Flag.Image size="xs" />
                  </Flag>
                  {/* The nearest gets its name; further ones keep theirs in the title. */}
                  {i === 0 && (
                    <span className="truncate">{names.get(other.tag)?.name ?? other.tag}</span>
                  )}
                </span>
              ))}
            </span>
            {more > 0 && <AllTags row={row} shown={shown} selected={selected} names={names} />}
          </span>
        )}
      </span>
    </div>
  );
}

/** When a tag was held: years, or the days when it began and ended in one year. */
function heldSpan(from: string | undefined, until: string | undefined) {
  const start = from ? parseDate(from) : null;
  const end = until ? parseDate(until) : null;
  if (start && end && start.year === end.year) {
    const day = (x: DateComponents) => `${MONTH_ABBR[x.month]} ${x.day}`;
    return start.month === end.month && start.day === end.day
      ? formatLongDate(start)
      : `${formatLongDate(start)}–${day(end)}`;
  }
  return `${start?.year ?? "…"}–${end?.year ?? "…"}`;
}

/** Every tag of a long chain, in order with dates, behind an "all" button. */
function AllTags({
  row,
  shown,
  selected,
  names,
}: {
  row: BySaveRow;
  shown: number;
  selected: number;
  names: ReadonlyMap<string, CountryInfo>;
}) {
  const tags = row.lineage?.tags ?? [];
  const current = heldIndex(row, shown, selected);
  return (
    <Popover>
      <Popover.Trigger asChild>
        <Button
          data-no-pick
          variant="ghost"
          shape="none"
          className="shrink-0 font-medium text-gray-900 underline underline-offset-2 dark:text-white"
          aria-label={`All ${tags.length} tags of this country`}
          onClick={(event) => event.stopPropagation()}
        >
          all
        </Button>
      </Popover.Trigger>
      <Popover.Content
        data-no-pick
        aria-label="Every tag of this country"
        // Keys here stay in the list and do not step the chart.
        onKeyDown={(event) => event.stopPropagation()}
        align="start"
        className="max-h-80 w-[min(560px,90vw)] overflow-y-auto rounded-md border border-gray-300 bg-white p-3 text-xs shadow-md dark:border-gray-600 dark:bg-slate-900"
      >
        <ol className={cx("flex flex-wrap gap-x-3 gap-y-1", muted)}>
          {tags.map((held, i) => {
            const name = names.get(held.tag)?.name ?? held.tag;
            const span = heldSpan(held.from, held.until);
            return (
              <li
                key={`${held.tag}${held.from}`}
                aria-current={i === current ? "true" : undefined}
                className={cx(
                  "flex items-center gap-1",
                  i === current && "font-semibold text-gray-900 dark:text-white",
                )}
              >
                <Flag tag={held.tag} name={name}>
                  <Flag.Image size="xs" />
                </Flag>
                {name}
                <span className={faint}>{span}</span>
              </li>
            );
          })}
        </ol>
      </Popover.Content>
    </Popover>
  );
}

/** One thin stroke per save. Drawn again only when the data or the size changes. */
const Strip = memo(function Strip({
  marks,
  geometry,
  width,
  height,
  scale,
  world,
  dark,
}: {
  marks: readonly (Mark | null)[];
  geometry: StripGeometry;
  width: number;
  height: number;
  scale: Scale;
  world: boolean;
  dark: boolean;
}) {
  const y = yOf(scale, height, world);
  const refs = scale.refs;
  const rim = dark ? "rgb(255 255 255 / 0.5)" : "rgb(15 23 42 / 0.55)";
  return (
    <svg
      width={width}
      height={height}
      className="block"
      shapeRendering={world ? "auto" : "crispEdges"}
    >
      {refs.map((ref) => {
        const at = Math.round(y(ref)) + 0.5;
        return (
          <line
            key={ref}
            x1={0}
            x2={width}
            y1={at}
            y2={at}
            className="stroke-current text-gray-900 dark:text-gray-100"
            strokeOpacity={world ? 0.22 : 0.1}
            strokeDasharray={world ? "1 3" : undefined}
          />
        );
      })}
      {marks.map((mark, i) => {
        if (!mark || Number.isNaN(geometry.x[i])) return null;
        if (world) {
          const cx = geometry.x[i] + geometry.bar / 2;
          return (
            <g key={i}>
              <rect
                x={Math.floor(cx)}
                y={height - 9}
                width={1}
                height={5}
                className="fill-current text-gray-500 dark:text-gray-400"
                opacity={0.6}
              />
              <circle
                cx={cx}
                cy={y(mark.value)}
                r={geometry.bar >= 2 ? 2.5 : 1.75}
                fill={mark.color}
              />
            </g>
          );
        }
        const top = Math.min(height - 1, Math.round(y(mark.value)));
        const rimmed = needsRim(mark.color, dark);
        return (
          <rect
            key={i}
            x={geometry.x[i]}
            y={top}
            width={geometry.bar}
            height={height - top}
            fill={mark.color}
            stroke={rimmed ? rim : undefined}
            strokeWidth={rimmed ? 0.5 : undefined}
          />
        );
      })}
    </svg>
  );
});

/** The selected, hovered and open saves as rules through the row. */
function Rules({
  geometry,
  height,
  selected,
  hovered,
  openColumn,
  dark,
}: {
  geometry: StripGeometry;
  height: number;
  selected: number;
  hovered: number | null;
  openColumn: number;
  dark: boolean;
}) {
  const color = dark ? ink.dark : ink.light;
  const at = (i: number) => Math.floor(geometry.x[i] + geometry.bar / 2) + 0.5;
  const line = (i: number, props: React.SVGProps<SVGLineElement>) =>
    Number.isNaN(geometry.x[i]) ? null : (
      <line x1={at(i)} x2={at(i)} y1={0} y2={height + 1} stroke={color} {...props} />
    );
  return (
    <>
      {openColumn >= 0 &&
        openColumn !== selected &&
        line(openColumn, { strokeDasharray: "3 3", strokeOpacity: 0.55 })}
      {hovered !== null && hovered !== selected && line(hovered, { strokeOpacity: 0.38 })}
      {line(selected, { strokeOpacity: 0.9 })}
    </>
  );
}

/** The strokes at the read saves, wider and edged in the rule's ink, never shorter than 6 px. */
function ReadMarks({
  marks,
  geometry,
  height,
  y,
  selected,
  hovered,
  world,
  dark,
}: {
  marks: readonly (Mark | null)[];
  geometry: StripGeometry;
  height: number;
  y: (value: number) => number;
  selected: number;
  hovered: number | null;
  world: boolean;
  dark: boolean;
}) {
  const color = dark ? ink.dark : ink.light;
  const read = [...new Set([hovered, selected])].filter((i): i is number => i !== null);
  return (
    <>
      {read.map((i) => {
        const mark = marks[i];
        if (!mark || Number.isNaN(geometry.x[i])) return null;
        const edge =
          i === selected ? color : dark ? "rgb(241 245 249 / 0.45)" : "rgb(15 23 42 / 0.38)";
        if (world) {
          return (
            <circle
              key={i}
              cx={geometry.x[i] + geometry.bar / 2}
              cy={y(mark.value)}
              r={4.5}
              fill={mark.color}
              stroke={edge}
              strokeWidth={1.5}
            />
          );
        }
        const wide = geometry.bar + (geometry.bar >= 2 ? 2 : 1);
        // A small floor keeps a low read stroke visible without lifting it to another value.
        const top = Math.min(Math.round(y(mark.value)), height - 2);
        return (
          <rect
            key={i}
            x={geometry.x[i] - (wide - geometry.bar) / 2 + 0.5}
            y={top + 0.5}
            width={wide - 1}
            height={height - top - 0.5}
            fill={mark.color}
            stroke={edge}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        );
      })}
    </>
  );
}

/**
 * The emphasized country's level carried into another row: a small square
 * per save in that country's own color, each on its own, never joined.
 */
function Beads({
  marks,
  own,
  geometry,
  height,
  y,
}: {
  marks: readonly (Mark | null)[];
  /** The row's own marks: a bead over its stroke reaches past both edges, so no notch is cut. */
  own: readonly (Mark | null)[];
  geometry: StripGeometry;
  height: number;
  y: (value: number) => number;
}) {
  // A bead that would touch the one before it is left out, so beads never join into a line.
  const beads = keptBeads(marks, own, geometry, height, y);
  return (
    <g shapeRendering="crispEdges">
      {beads.map((bead) => (
        <rect
          key={bead.i}
          x={bead.left}
          y={bead.top}
          width={bead.width}
          height={2}
          fill={bead.color}
        />
      ))}
    </g>
  );
}

/** The beads to draw, each at least two pixels from the one before. */
function keptBeads(
  marks: readonly (Mark | null)[],
  own: readonly (Mark | null)[],
  geometry: StripGeometry,
  height: number,
  y: (value: number) => number,
) {
  const kept: { i: number; left: number; top: number; width: number; color: string }[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    if (!mark || Number.isNaN(geometry.x[i])) continue;
    const top = Math.min(height - 3, Math.round(y(mark.value)) - 1);
    const stroke = own[i];
    const over = !!stroke && top >= Math.round(y(stroke.value));
    const width = over ? Math.ceil(geometry.bar) + 2 : 2;
    const left = Math.round(geometry.x[i] + geometry.bar / 2 - width / 2);
    const before = kept.at(-1);
    if (before && left - (before.left + before.width) < 2) continue;
    kept.push({ i, left, top, width, color: mark.color });
  }
  return kept;
}

/** The countries with dots elsewhere that have no row at the selected save. */
export function NotAtThisSave({
  rows,
  column,
  names,
}: {
  rows: readonly BySaveRow[];
  column: number;
  names: ReadonlyMap<string, CountryInfo>;
}) {
  if (!rows.length) return null;
  return (
    <p className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", muted)}>
      Not at this save:
      {rows.map((row) => {
        const tag = rowTag(row, column);
        const name = names.get(tag)?.name ?? tag;
        return (
          <span key={row.key} className="flex items-center gap-1">
            <Flag tag={tag} name={name}>
              <Flag.Image size="xs" />
            </Flag>
            {name}
            {row.lineage?.kind === "earlierHolder" && " (earlier country)"}
          </span>
        );
      })}
    </p>
  );
}

/** A value that follows another after the other stops changing for a while. */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
