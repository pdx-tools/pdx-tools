import { memo } from "react";
import { Flag } from "@/features/eu4/components/avatars";
import { distinctTexts, placeRows } from "./history";
import { edgeFor } from "./historyOption";
import type { ChartLine, Comparison, Palette, PlotMap } from "./historyOption";
import type { StandingRow, StandingsLayout } from "./Standings";

/**
 * What is drawn over the chart's canvas: the marks at the selected save,
 * leaders to the standings, the bracket, gap sticks, the "since" ring,
 * the flags where lines end, and the hover. Every position comes from the
 * plot mapping that the chart's option is built from, so these stand
 * where ECharts draws the lines.
 */

/** The plot's top edge: room for the caps over the rules and the hover date. */
export const TOP = 18;
export const ROW = 22;

export type MarkProps = {
  /** Sparse saves draw large dots; the selected marks stay larger. */
  sparse: boolean;
  width: number;
  height: number;
  map: PlotMap;
  days: readonly number[];
  lines: readonly ChartLine[];
  rows: readonly StandingRow[];
  values: readonly (number | null)[];
  selected: number;
  world: boolean;
  subject: string | null;
  pointed: string | null;
  comparison: Comparison | null;
  placement: { layout: StandingsLayout; centers: number[]; tight: boolean };
  scroll: boolean;
  scrollTop: number;
  listTop: number;
  tableX: number;
  palette: Palette;
  dark: boolean;
  format: (value: number) => string;
};

/** In-color marks at a column, largest first, close ones ringed outward in their own colors (D5). */
function ringed(
  entries: readonly { key: string; y: number; color: string; subject: boolean; back: boolean }[],
  palette: Palette,
  dark: boolean,
  sparse = false,
) {
  let prev = -99;
  let run = 0;
  return entries.map((entry) => {
    run = Math.abs(entry.y - prev) < 3 ? run + 1 : 0;
    prev = entry.y;
    // The selected save is the strongest point of its line: above sparse saves' large dots too.
    const radius = sparse ? (entry.subject ? 6 : 5) : entry.subject ? 4.6 : 3.6;
    const edge = edgeFor(entry.color, dark, palette.ground);
    return run > 0
      ? { ...entry, ring: true, r: radius + 3 * run, stroke: entry.color, width: 1.5 }
      : { ...entry, ring: false, r: radius, stroke: edge ?? palette.ground, width: edge ? 1 : 1.5 };
  });
}

export const Marks = memo(function Marks(p: MarkProps) {
  const { map, days, lines, palette } = p;
  const sel = p.selected;
  const fx = map.x(days[sel]);
  const plotR = map.left + map.width;
  const far = plotR - fx > 60;
  const pinned = p.rows.some((row) => row.pinned);
  const emphasis = p.pointed !== null || pinned;
  const roleOf = (row: StandingRow) => {
    const isP = row.role === "subject";
    const isE = row.key === p.pointed || row.role === "compared";
    const grey = row.role === "grey" && !isE;
    return { isP, isE, grey, back: emphasis && !isP && !isE };
  };
  const clip = (x: number) => x >= map.left - 1 && x <= plotR + 1;
  // A point drawn over the chart must lie in the plot on both axes, as a fitted scale may cut it.
  const inside = (x: number, y: number) =>
    clip(x) && y >= map.top - 2 && y <= map.top + map.height + 2;

  if (p.world) {
    const value = lines[0]?.values[sel];
    if (value === null || value === undefined) return null;
    const y = map.y(value);
    return (
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={p.width}
        height={p.height}
      >
        <circle
          cx={fx}
          cy={y}
          r={4.6}
          fill={palette.accent}
          stroke={palette.ground}
          strokeWidth={1.5}
        />
        <text
          x={fx + 14}
          y={y + 6}
          fontSize={18}
          fontWeight={700}
          fill={palette.ink}
          stroke={palette.ground}
          strokeWidth={4}
          paintOrder="stroke"
          className="tabular-nums"
        >
          {p.format(value)}
        </text>
      </svg>
    );
  }

  // The gap to the compared country at each save, in the color of whoever is ahead there (D5).
  const sticks: { x: number; y1: number; y2: number; color: string }[] = [];
  const comparison = p.comparison;
  if (comparison) {
    const every = Math.max(1, Math.ceil((sel + 1) / 110));
    for (let i = 0; i <= sel; i += every) {
      const a = comparison.subject.values[i];
      const b = comparison.rival.values[i];
      const x = map.x(days[i]);
      if (a === null || b === null || a === b || !clip(x)) continue;
      const color =
        (a > b ? comparison.subject.colors[i] : comparison.rival.colors[i]) ?? palette.ink;
      sticks.push({ x, y1: map.y(a), y2: map.y(b), color });
    }
  }
  const since = comparison && comparison.since !== null ? comparison.since : null;
  const sinceValue = since !== null ? comparison!.subject.values[since] : null;

  // Leaders: level from the mark on the rule, then bent to the row; from far off only for
  // the followed and compared rows (D5).
  const live = p.rows.filter((row) => !row.gone);
  const listTop = TOP - 12;
  const listH = p.placement.layout.kind === "flow" ? p.placement.layout.height : 0;
  const own = live.findIndex((row) => row.role === "subject");
  const ownAt = listTop + 1 + own * ROW + ROW / 2 - p.scrollTop;
  const stuck =
    p.scroll && own >= 0 && (ownAt < listTop + 12 || ownAt > listTop + listH - 12)
      ? Math.max(listTop + 12, Math.min(listTop + listH - 12, ownAt))
      : null;
  const leaders = live.flatMap((row, k) => {
    const value = p.values[p.rows.indexOf(row)];
    if (value === null || value === undefined) return [];
    let ry: number;
    if (p.scroll) {
      ry = listTop + 1 + k * ROW + ROW / 2 - p.scrollTop;
      if (row.role === "subject") ry = Math.max(listTop + 12, Math.min(listTop + listH - 12, ry));
      // A row behind the followed row where it sticks has no leader of its own.
      else if (stuck !== null && Math.abs(ry - stuck) < ROW) return [];
      if (ry < listTop + 6 || ry > listTop + listH - 6) return [];
    } else ry = p.placement.centers[k];
    const { isP, isE, grey, back } = roleOf(row);
    const lead = isP || isE;
    const color = grey ? palette.field : row.color;
    const draw = lead || (!far && (!p.scroll || !grey));
    return [{ key: row.key, y: map.y(value), ry, isP, isE, grey, back, lead, color, draw }];
  });
  const x2 = p.tableX - 9;
  const bracket =
    p.placement.layout.kind === "placed" && p.placement.layout.listed && live.length > 1
      ? {
          a: p.placement.layout.tops[0] + 3,
          b:
            p.placement.layout.tops[live.length - 1] +
            p.placement.layout.heights[live.length - 1] -
            3,
        }
      : null;

  // The marks on the selected save.
  const marks = ringed(
    p.rows
      .filter((row) => !row.gone && (row.role !== "grey" || row.key === p.pointed))
      .flatMap((row) => {
        const value = p.values[p.rows.indexOf(row)];
        if (value === null || value === undefined) return [];
        const { isP, back } = roleOf(row);
        return [{ key: row.key, y: map.y(value), color: row.color, subject: isP, back }];
      }),
    palette,
    p.dark,
    p.sparse,
  );

  // A line that ended before the selected save keeps its flag at its last value (D5).
  const ended = lines.flatMap((line) => {
    const last = line.values.findLastIndex((v) => v !== null);
    if (last < 0 || last >= sel) return [];
    const x = map.x(days[last]);
    if (!inside(x, map.y(line.values[last]!))) return [];
    const back =
      emphasis && line.key !== p.pointed && line.role !== "subject" && line.role !== "compared";
    return [
      {
        key: line.key,
        x,
        y: map.y(line.values[last]!),
        tag: line.tags[last] ?? "",
        name: line.names[last] ?? "",
        opacity: line.key === p.pointed ? 1 : back || line.role === "grey" ? 0.3 : 0.6,
      },
    ];
  });

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={p.width}
        height={p.height}
      >
        {sticks.map((s, i) => (
          <path
            key={i}
            d={`M${s.x} ${s.y1}V${s.y2}`}
            stroke={s.color}
            strokeOpacity={0.38}
            strokeWidth={0.75}
          />
        ))}
        {leaders.map((l) => (
          <g key={l.key} opacity={l.back ? 0.45 : 1}>
            {l.draw && plotR - fx > 6 && (
              <path
                d={`M${fx + 7} ${Math.round(l.y) + 0.5}H${plotR + 5}`}
                fill="none"
                stroke={l.isE && !l.isP ? l.color : palette.ink}
                strokeOpacity={0.6}
              />
            )}
            {l.draw && (
              <path
                d={`M${plotR + 5} ${Math.round(l.y) + 0.5}h4L${x2 - 4} ${Math.round(l.ry) + 0.5}H${x2}`}
                fill="none"
                stroke={l.lead ? (l.isE && !l.isP && far ? l.color : palette.ink) : palette.faint}
                strokeOpacity={l.lead ? 0.9 : 0.6}
              />
            )}
            <rect
              x={p.tableX - 7}
              y={Math.round(l.ry - (l.isP ? 8 : 6))}
              width={l.grey ? 3 : 4}
              height={l.isP ? 16 : 12}
              fill={l.color}
            />
          </g>
        ))}
        {bracket && (
          <path
            d={`M${p.tableX - 10} ${bracket.a}H${p.tableX - 13}V${bracket.b}H${p.tableX - 10}`}
            fill="none"
            stroke={palette.faint}
            strokeOpacity={0.7}
          />
        )}
        {since !== null && sinceValue !== null && inside(map.x(days[since]), map.y(sinceValue)) && (
          <circle
            cx={map.x(days[since])}
            cy={map.y(sinceValue)}
            r={8}
            fill="none"
            stroke={palette.ink}
            strokeWidth={1.25}
          />
        )}
        {clip(fx) &&
          marks.map((m) => (
            <circle
              key={m.key}
              cx={fx}
              cy={m.y}
              r={m.r}
              fill={m.ring ? "none" : m.color}
              stroke={m.stroke}
              strokeWidth={m.width}
              opacity={m.back ? 0.3 : 1}
            />
          ))}
      </svg>
      {ended.map((e) => (
        <span
          key={e.key}
          aria-hidden
          className="pointer-events-none absolute flex"
          style={{ left: e.x + 4, top: e.y - 6, opacity: e.opacity }}
        >
          <Flag tag={e.tag} name={e.name}>
            <Flag.Image size="micro" />
          </Flag>
        </span>
      ))}
    </>
  );
});

export type HoverProps = {
  column: number | null;
  map: PlotMap;
  days: readonly number[];
  lines: readonly ChartLine[];
  selected: number;
  subject: string | null;
  pointed: string | null;
  world: boolean;
  palette: Palette;
  dark: boolean;
  format: (value: number) => string;
  fine: (value: number, digits: number) => string;
  dateOf: (day: number) => string;
};

/**
 * A hovered save other than the selected one: its rule and date, ringed
 * marks, and each colored line's flag and figure on a halo (D5). The
 * standings and the heading stay on the selected save.
 */
export const Hover = memo(function Hover(p: HoverProps) {
  const { map, days, palette } = p;
  const h = p.column;
  if (h === null || h === p.selected || h >= days.length) return null;
  const hx = map.x(days[h]);
  const fx = map.x(days[p.selected]);
  const plotR = map.left + map.width;
  const shown = p.lines
    .filter(
      (line) =>
        line.values[h] !== null && (line.role !== "grey" || line.key === p.pointed || p.world),
    )
    .map((line) => ({ line, value: line.values[h]! }))
    .sort((a, b) => b.value - a.value);
  const texts = distinctTexts(
    shown.map((x) => x.value),
    p.format,
    p.fine,
  );
  const marks = ringed(
    shown.map(({ line, value }) => ({
      key: line.key,
      y: map.y(value),
      color: p.world ? palette.accent : (line.colors[h] ?? palette.ink),
      subject: line.key === p.subject,
      back: false,
    })),
    palette,
    p.dark,
  );
  const tags = placeRows(
    shown.map(({ value }) => ({ want: map.y(value), height: 15 })),
    map.top - 4,
    map.top + map.height + 6,
  ).tops;
  const left = hx + 84 > plotR || (hx < fx && hx + 84 > fx);
  const near = Math.abs(hx - fx) < 70;
  const halo = `0 0 2px ${palette.ground}, 0 0 2px ${palette.ground}, 0 0 3px ${palette.ground}, 0 0 3px ${palette.ground}`;
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={plotR + 40}
        height={map.top + map.height + 12}
      >
        <line
          x1={Math.round(hx) + 0.5}
          x2={Math.round(hx) + 0.5}
          y1={map.top - 7}
          y2={map.top + map.height + 4}
          stroke={palette.hoverRule}
        />
        {marks.map((m) => (
          <circle
            key={m.key}
            cx={hx}
            cy={m.y}
            r={m.r}
            fill={m.ring ? "none" : m.color}
            stroke={m.stroke}
            strokeWidth={m.width}
          />
        ))}
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute text-xs font-semibold whitespace-nowrap text-gray-950 tabular-nums dark:text-white"
        style={{
          top: map.top - 20,
          left: hx,
          transform: near
            ? hx < fx
              ? "translateX(calc(-100% - 8px))"
              : "translateX(8px)"
            : "translateX(-50%)",
          textShadow: halo,
        }}
      >
        {p.dateOf(days[h])}
      </div>
      {p.world && shown[0] && (
        <div
          aria-hidden
          className="pointer-events-none absolute text-[15px] font-bold whitespace-nowrap text-gray-950 tabular-nums dark:text-white"
          style={{ left: hx + 12, top: map.y(shown[0].value) - 10, textShadow: halo }}
        >
          {p.format(shown[0].value)}
        </div>
      )}
      {!p.world &&
        shown.map(({ line }, i) => {
          const emphasized = line.key === p.pointed;
          const bold = emphasized || line.key === p.subject;
          return (
            <div
              key={line.key}
              aria-hidden
              className={`pointer-events-none absolute flex items-center gap-1 text-xs whitespace-nowrap text-gray-950 tabular-nums dark:text-white ${bold ? "font-bold" : "font-medium"} ${left ? "flex-row-reverse" : ""}`}
              style={{
                top: tags[i],
                height: 15,
                left: left ? undefined : hx + 9,
                right: left ? `calc(100% - ${hx - 9}px)` : undefined,
                textShadow: halo,
              }}
            >
              <Flag tag={line.tags[h] ?? ""} name={line.names[h] ?? ""}>
                <Flag.Image size="micro" />
              </Flag>
              <span>
                {texts[i]}
                {emphasized ? ` ${line.names[h] ?? ""}` : ""}
              </span>
            </div>
          );
        })}
    </>
  );
});
