import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { Popover } from "@/components/Popover";
import { Table } from "@/components/Table";
import { MONTH_ABBR, formatLongDate, parseDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { Flag } from "@/features/eu4/components/avatars";
import type { BySaveFigure } from "./figures";
import type { StripGeometry } from "./ledgerGeometry";
import { faint, muted, yOf } from "./ledgerLayout";
import type { Layout, Mark, Scale } from "./ledgerLayout";
import { ReadMarks, Rules, Strip } from "./LedgerMarks";
import { amount, heldIndex, nearestTags, rowTag, switchYear } from "./model";
import type { BySaveRow, CountryInfo } from "./model";

export type LedgerRowProps = {
  row: BySaveRow;
  marks: readonly (Mark | null)[];
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
  /** The row labels its reference lines. */
  label: boolean;
  figure: BySaveFigure;
  names: ReadonlyMap<string, CountryInfo>;
  world: boolean;
  dark: boolean;
  onPointerEmphasis: (key: string | null) => void;
  onFocusEmphasis: (key: string | null) => void;
};

/** One country: its name, its strip of strokes, and its value at the shown save. */
export function LedgerRow({
  row,
  marks,
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
}: LedgerRowProps) {
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
      {/* The row header is the focus stop: focus shows this country's level in the other rows. */}
      <th
        scope="row"
        tabIndex={world ? undefined : 0}
        onFocus={world ? undefined : () => onFocusEmphasis(row.key)}
        onBlur={world ? undefined : () => onFocusEmphasis(null)}
        className="rounded-sm p-0 text-left font-normal focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-600"
        {...emphasize}
      >
        {world ? (
          <span className="sr-only">{figure.title}</span>
        ) : (
          <RowName row={row} shown={shown} selected={selected} names={names} layout={layout} />
        )}
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
          {/* Only the strokes fade; the rules stay. */}
          <div className="transition-opacity duration-150" style={{ opacity: faded ? 0.4 : 1 }}>
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
          </svg>
        </div>
      </td>
      <Table.Cell
        className={cx(
          "p-0 text-right tabular-nums",
          world
            ? cx("align-top font-bold", layout.narrow ? "text-2xl" : "text-[32px] leading-9")
            : cx("font-medium", layout.compact || layout.narrow ? "text-lg" : "text-xl"),
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
  if (!world) {
    if (ref >= 10) return figure.format(ref);
    // A small reference keeps its decimals, without floating-point noise, and its unit.
    const unit = figure.format(1).replace(/[\d.,\s]/g, "");
    return `${Number(ref.toPrecision(3))}${unit}`;
  }
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
 * tags. A click opens nothing, so reading the chart never leaves it.
 */
function RowName({
  row,
  shown,
  selected,
  names,
  layout,
}: {
  row: BySaveRow;
  shown: number;
  selected: number;
  names: ReadonlyMap<string, CountryInfo>;
  layout: Layout;
}) {
  const tag = rowTag(row, shown, selected);
  const name = names.get(tag)?.name ?? tag;
  const { near, more } = nearestTags(row, shown, selected);
  const earlier = row.lineage?.kind === "earlierHolder";
  const nameOf = (other: string) => names.get(other)?.name ?? other;
  return (
    <span className="flex min-w-0 items-center gap-2.5 pr-3">
      <Flag tag={tag} name={name}>
        <Flag.Image size={layout.flag} />
      </Flag>
      <span className="flex min-w-0 flex-col">
        <span
          className={cx(
            "truncate font-medium",
            layout.narrow || layout.compact ? "text-sm" : "text-base leading-5",
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
                  className={cx(
                    "flex items-center gap-1",
                    i === 0 ? "min-w-[5.5rem] shrink" : "shrink-0",
                  )}
                  title={
                    other.relation === "was"
                      ? `${nameOf(other.tag)} until ${switchYear(other.until)}`
                      : `${nameOf(other.tag)} from ${switchYear(other.from)}`
                  }
                >
                  {(i === 0 || near[i - 1].relation !== other.relation) && (
                    <span>{other.relation}</span>
                  )}
                  <Flag tag={other.tag} name={nameOf(other.tag)}>
                    <Flag.Image size="xs" />
                  </Flag>
                  {/* The nearest gets its name; further ones keep theirs in the title. */}
                  {i === 0 && <span className="truncate">{nameOf(other.tag)}</span>}
                </span>
              ))}
            </span>
            {more > 0 && <AllTags row={row} shown={shown} selected={selected} names={names} />}
          </span>
        )}
      </span>
    </span>
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
                <span className={faint}>{heldSpan(held.from, held.until)}</span>
              </li>
            );
          })}
        </ol>
      </Popover.Content>
    </Popover>
  );
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
