import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Table } from "@/components/Table";
import { isDarkMode } from "@/lib/dark";
import { dayNumber, formatLongDate } from "@/features/timeline/date";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import type { BySaveFigure } from "./figures";
import { countryScale, fittedScale, nearestSave, stripGeometry } from "./ledgerGeometry";
import { accent, columnsFor, layoutFor } from "./ledgerLayout";
import type { Mark } from "./ledgerLayout";
import { LedgerRow } from "./LedgerRow";
import { LedgerRuler } from "./LedgerRuler";
import { amount } from "./model";
import type { BySaveRow, CountryInfo } from "./model";

export { NotAtThisSave } from "./LedgerRow";

export type LedgerProps = {
  columns: readonly AnalysisSave[];
  /** The rows in their shown order. */
  rows: readonly BySaveRow[];
  /** Every row of the figure, for the shared scale and the row height. */
  allRows: readonly BySaveRow[];
  selected: number;
  hovered: number | null;
  /** The open save's column, or -1. */
  openColumn: number;
  figure: BySaveFigure;
  names: ReadonlyMap<string, CountryInfo>;
  /** The world total: one row of dots on a fitted scale. */
  world: boolean;
  /** The row in front, while its name or value is hovered or its name focused: the other rows fade. */
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
 * Each country as a row: its flag and name, one stroke per save at the
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
  const [size, setSize] = useState({ ledger: 768, strip: 470 });
  useLayoutEffect(() => {
    const measure = () => {
      const ledger = wrapper.current?.clientWidth ?? 768;
      const width = Math.floor(strip.current?.clientWidth ?? 470);
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

  // The scale covers every value of every row, so no stroke reaches a row's edge.
  const scale = useMemo(() => {
    const values = [...marks.values()].flatMap((x) => x.flatMap((m) => (m ? [m.value] : [])));
    if (world) {
      const fitted = fittedScale(values);
      return { lo: fitted.lo, hi: fitted.hi, refs: fitted.steps };
    }
    return countryScale(Math.max(0, ...values));
  }, [marks, world]);

  const pointerSave = (clientX: number) => {
    const box = strip.current?.getBoundingClientRect();
    if (!box) return null;
    const px = clientX - box.left;
    if (px < -6 || px > box.width + 6) return null;
    return nearestSave(geometry, px);
  };

  const style = {
    "--c-id": `${widths.id}px`,
    "--c-scale": `${widths.scale}px`,
    "--c-val": `${widths.value}px`,
  } as React.CSSProperties;

  return (
    <div ref={wrapper} style={style} className="relative">
      {/* The heading and the ruler stay in view while a long list scrolls. */}
      <div className="sticky -top-6 z-10 -mx-4 border-b border-gray-200 bg-white px-4 shadow-[0_3px_6px_-4px_rgb(0_0_0/0.15)] dark:border-gray-700 dark:bg-slate-900 dark:shadow-[0_3px_6px_-4px_rgb(0_0_0/0.6)]">
        {header}
        <div
          className="mt-2 grid h-9 grid-cols-[var(--c-id)_var(--c-scale)_minmax(0,1fr)_var(--c-val)]"
          aria-hidden
        >
          <div />
          <div />
          <div ref={strip} className="relative">
            <LedgerRuler
              geometry={geometry}
              width={size.strip}
              selected={selected}
              hovered={hovered}
              openColumn={openColumn}
              dark={dark}
            />
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
      {/* With the gap below, 24 px between the last row and the foot. */}
      <div className="h-3" />
    </div>
  );
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

/** A value that follows another after the other stops changing for a while. */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
