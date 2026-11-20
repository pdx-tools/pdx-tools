import { useMemo } from "react";
import { cx } from "class-variance-authority";
import type { StripGeometry } from "./ledgerGeometry";
import { centerOf, faint, ink, muted } from "./ledgerLayout";
import { timeTicks } from "./timeTicks";

/**
 * The time heads over the strips: round years (or months, or days), a cap
 * for the selected save, a light mark for the hovered one, and "Open" over
 * the open save when another is selected.
 */
export function LedgerRuler({
  geometry,
  width,
  selected,
  hovered,
  openColumn,
  dark,
}: {
  geometry: StripGeometry;
  width: number;
  selected: number;
  hovered: number | null;
  openColumn: number;
  dark: boolean;
}) {
  const ticks = useMemo(() => timeTicks(geometry.from, geometry.to, 0), [geometry]);
  const at = (day: number) => Math.round(geometry.xDay(day) + geometry.bar / 2) + 0.5;
  const tickGap = ticks.ticks.length > 1 ? at(ticks.ticks[1]) - at(ticks.ticks[0]) : Infinity;
  // Every other label when the widest one would not fit between ticks.
  const widest = Math.max(0, ...ticks.ticks.map((day) => ticks.label(day).length)) * 7 + 8;
  const every = tickGap < widest ? Math.ceil(widest / Math.max(1, tickGap)) : 1;
  const color = dark ? ink.dark : ink.light;
  const open =
    openColumn >= 0 && openColumn !== selected && !Number.isNaN(geometry.x[openColumn])
      ? centerOf(geometry, openColumn)
      : null;
  // "Open" takes the label row there, so no year label touches it.
  const clear = (x: number) => open === null || Math.abs(x - open) > widest / 2 + 16;
  return (
    <svg width={width} height={36} className="block overflow-visible">
      {ticks.ticks.map((day, i) => {
        const x = at(day);
        const labeled = i % every === 0 && clear(x);
        return (
          <g key={day}>
            <line x1={x} x2={x} y1={17} y2={21} className="stroke-gray-300 dark:stroke-gray-600" />
            {labeled && (
              <text x={x} y={12} textAnchor="middle" className={cx("fill-current text-xs", faint)}>
                {ticks.label(day)}
              </text>
            )}
          </g>
        );
      })}
      {open !== null && (
        <text
          x={open > width - 24 ? width : open < 24 ? 0 : open}
          y={12}
          textAnchor={open > width - 24 ? "end" : open < 24 ? "start" : "middle"}
          className={cx("fill-current text-[11px] font-semibold", muted)}
        >
          Open
        </text>
      )}
      {!Number.isNaN(geometry.x[selected]) && (
        <>
          <rect x={centerOf(geometry, selected) - 2.5} y={26} width={5} height={5} fill={color} />
          <rect x={centerOf(geometry, selected) - 0.5} y={31} width={1} height={5} fill={color} />
        </>
      )}
      {hovered !== null && hovered !== selected && !Number.isNaN(geometry.x[hovered]) && (
        <rect
          x={centerOf(geometry, hovered) - 0.5}
          y={26}
          width={1}
          height={10}
          opacity={0.6}
          fill={color}
        />
      )}
    </svg>
  );
}
