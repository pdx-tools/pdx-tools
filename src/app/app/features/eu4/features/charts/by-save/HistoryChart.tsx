import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as echarts from "echarts/core";
import { EChart } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { Flag } from "@/features/eu4/components/avatars";
import { distinctTexts, placeRows, saveYearLabels, valueScale } from "./history";
import type { ValueScale } from "./history";
import {
  edgeFor,
  historyOption,
  lineSeriesIds,
  nearestColumn,
  palettes,
  plotMap,
} from "./historyOption";
import type { ChartLine, Comparison, Palette, PlotMap } from "./historyOption";
import { Standings } from "./Standings";
import type { StandingRow, StandingsLayout } from "./Standings";
import { timeTicks } from "./timeTicks";

/** The plot's top edge: room for the caps over the rules and the hover date. */
const TOP = 22;
const AXIS = 34;
const SLIDER = 22;
/** Rows that would move further than this from their values stand as a list. */
const MOST_PUSH = 40;
/** Above this many rows, the standings scroll. */
const MOST_PLACED = 20;
/** With more saves than this, the zoom strip shows at rest (D5). */
const STRIP_SAVES = 120;
const ROW = 22;

export type HistoryChartProps = {
  days: readonly number[];
  /** Every line, in a fixed order. */
  lines: readonly ChartLine[];
  /** The standings at the selected time, then the countries without a figure then. */
  rows: readonly StandingRow[];
  /** Each standing row's value, for its place beside the plot; null for a row without a figure. */
  values: readonly (number | null)[];
  world: boolean;
  /** A dot at each save. */
  dots: boolean;
  selected: number;
  open: number;
  /** The days in view, or null for all. */
  view: [number, number] | null;
  /** Fit the scale to what is in view. */
  fitted: boolean;
  sparse: boolean;
  long: (gap: number) => boolean;
  /** The followed country, if any. */
  subject: string | null;
  /** The country under the pointer or keyboard focus. */
  pointed: string | null;
  /** The followed country against the pointed one, else the latest pin. */
  comparison: Comparison | null;
  format: (value: number) => string;
  fine: (value: number, digits: number) => string;
  tick: (value: number, step: number) => string;
  yearOf: (day: number) => string;
  dateOf: (day: number) => string;
  /** The standings table's name. */
  label: string;
  focusKey: string | null;
  onSelect: (column: number) => void;
  onPick: (key: string) => void;
  onPoint: (key: string | null) => void;
  /** The standings row with keyboard focus. */
  onFocusRow: (key: string | null) => void;
  onZoom: (view: [number, number] | null) => void;
};

const MemoStandings = memo(Standings);

/**
 * The history chart: the lines drawn by ECharts, and over them, from the
 * same plot mapping, the marks at the selected save, the leaders to the
 * standings, the gap sticks of a comparison and the hover. Pointing and
 * hovering never rebuild the option.
 */
export function HistoryChart(props: HistoryChartProps) {
  const { days, lines, rows, values, world, selected } = props;
  const wrapper = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, room: 0 });
  useLayoutEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    // The plot grows into a tall drawer: the room below the chart's top.
    const measure = () => {
      const width = Math.floor(element.clientWidth);
      const room = Math.floor(window.innerHeight - element.getBoundingClientRect().top);
      setSize((x) => (x.width === width && x.room === room ? x : { width, room }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const { width } = size;
  const dark = isDarkMode();
  const palette = palettes[dark ? "dark" : "light"];
  const { fitted, sparse, long, dots, open, tick, yearOf } = props;
  const narrow = width < 600;
  const n = days.length;
  const from = props.view?.[0] ?? days[0];
  // One save alone still has a span, as ECharts gives one to an axis whose bounds are equal.
  const to = Math.max(props.view?.[1] ?? days[n - 1], from + 1);

  const scroll = rows.length > MOST_PLACED;
  const many = lines.length > 12;
  // At the narrowest the standings give up width before they would cover the plot.
  const tableWidth = world
    ? 0
    : narrow
      ? Math.min(170, Math.max(118, Math.round(width * 0.42)))
      : 226;
  const fan = world ? (narrow ? 76 : 104) : narrow ? (width < 420 ? 14 : 26) : 44;
  const left = width < 420 ? 40 : 46;
  const plotWidth = Math.max(40, width - left - tableWidth - fan);
  const liveCount = rows.filter((row) => !row.gone).length;
  const slider = n > STRIP_SAVES || props.view !== null;
  // D5's 384 px (330 narrow), grown to at most 520 px where the drawer has the room.
  const base = narrow ? 330 : 384;
  const grown = Math.min(520, size.room - AXIS - (slider ? SLIDER : 0) - 96);
  const plotHeight = world
    ? narrow
      ? 220
      : 280
    : Math.max(base, grown, many && !scroll ? ROW * liveCount - 20 : 0);

  const scale = useMemo((): ValueScale => {
    let min = Infinity;
    let max = -Infinity;
    for (const line of lines) {
      line.values.forEach((value, i) => {
        if (value === null) return;
        if (fitted && (days[i] < from || days[i] > to)) return;
        min = Math.min(min, value);
        max = Math.max(max, value);
      });
    }
    return valueScale(min, max, !world && !fitted);
  }, [lines, days, from, to, fitted, world]);
  const grid = useMemo(
    () => ({ left, top: TOP, width: plotWidth, height: plotHeight }),
    [left, plotWidth, plotHeight],
  );
  const map = useMemo(() => plotMap(grid, [from, to], scale), [grid, from, to, scale]);

  // While the strip is dragged, ECharts moves the plot at once; the overlay follows from here.
  const [drag, setDrag] = useState<{ key: string; view: [number, number] } | null>(null);
  const viewKey = `${from}:${to}`;
  const live = useMemo(
    () => (drag && drag.key === viewKey ? plotMap(grid, drag.view, scale) : map),
    [drag, viewKey, grid, scale, map],
  );

  // Rows stand beside their values when that takes little nudging, else as a tight list.
  const fx = map.x(days[selected]);
  const plotR = map.left + map.width;
  const far = plotR - fx > 60;
  const placement = useMemo((): {
    layout: StandingsLayout;
    centers: number[];
    tight: boolean;
  } => {
    if (world || scroll)
      return {
        layout: { kind: "flow", height: plotHeight + 24, rowHeight: ROW },
        centers: [],
        tight: true,
      };
    const live = rows.filter((row) => !row.gone);
    const heightsFor = (tight: boolean) =>
      live.map(
        (row) =>
          (many || tight ? ROW : narrow ? 26 : 28) +
          (!tight && !many && !narrow && row.note ? 8 : 0),
      );
    const wants = live.map((row) => map.y(values[rows.indexOf(row)] ?? 0));
    const top = TOP - 12;
    const place = (heights: number[]) =>
      placeRows(
        wants.map((want, i) => ({ want, height: heights[i] })),
        top,
        Math.max(TOP + plotHeight + 12, top + heights.reduce((a, b) => a + b, 0)),
      );
    let heights = heightsFor(false);
    let placed = place(heights);
    let tight = many;
    if (!many && placed.push > MOST_PUSH) {
      tight = true;
      heights = heightsFor(true);
      placed = place(heights);
    }
    const bottom = Math.max(top, ...placed.tops.map((t, i) => t + heights[i]));
    const goneTop = bottom + (rows.length > live.length ? 8 : 0);
    const tops = [...placed.tops];
    const allHeights = [...heights];
    rows.forEach((row, i) => {
      if (!row.gone) return;
      tops.push(goneTop + (i - live.length) * 20);
      allHeights.push(20);
    });
    return {
      // From further away, tight rows are a list, not positions: a bracket says so (D5).
      layout: {
        kind: "placed",
        tops,
        heights: allHeights,
        tight,
        listed: tight && far,
        rows: live.length,
      },
      centers: placed.tops.map((t, i) => t + heights[i] / 2),
      tight,
    };
  }, [rows, values, plotHeight, map, narrow, many, scroll, world, far]);

  const xLabels = useMemo(() => {
    const inView = days.flatMap((day, i) => (day >= from && day <= to ? [i] : []));
    if (sparse || inView.length <= 12) {
      const xs = inView.map((i) => map.x(days[i]));
      const at = inView.indexOf(selected);
      const kept = saveYearLabels(xs, at >= 0 ? at : 0, 38);
      return { kind: "saves" as const, columns: kept.map((k) => inView[k]) };
    }
    const { ticks } = timeTicks(from, to, 0);
    // Keep labels clear of each other at this width.
    const room = Math.max(1, Math.ceil((38 * ticks.length) / plotWidth));
    return { kind: "ticks" as const, days: ticks.filter((_, i) => i % room === 0) };
  }, [days, from, to, map, plotWidth, sparse, selected]);

  const font = useMemo(
    () =>
      typeof window === "undefined" ? "sans-serif" : getComputedStyle(document.body).fontFamily,
    [],
  );
  const chartHeight = TOP + plotHeight + AXIS + (slider ? SLIDER : 0);
  const option = useMemo(
    () =>
      historyOption({
        days,
        lines,
        world,
        dots,
        selected,
        open,
        map,
        slider,
        sparse,
        long,
        xLabels,
        yearOf,
        palette,
        dark,
        tick,
        font,
        height: chartHeight,
      }),
    [
      days,
      lines,
      world,
      dots,
      selected,
      open,
      map,
      slider,
      sparse,
      long,
      xLabels,
      yearOf,
      palette,
      dark,
      tick,
      font,
      chartHeight,
    ],
  );

  // The hovered save, chosen here from the pointer, and the list's scroll offset.
  const [hover, setHover] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // The chart's events read the latest values without rebinding.
  const latest = useRef({ props, live });
  useLayoutEffect(() => {
    latest.current = { props, live };
  });
  const chartRef = useRef<echarts.ECharts | null>(null);
  // Pointing is a highlight: the pointed line and the followed one lit, the others blurred.
  const { pointed, subject } = props;
  const lit = useRef<string[]>([]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // By id, so a rebuild that moves a line never lets down or lights another; only what
    // was lit is let down, as a downplay of every series costs a full repaint.
    if (lit.current.length) chart.dispatchAction({ type: "downplay", seriesId: lit.current });
    lit.current = [];
    if (!pointed || !lines.some((line) => line.key === pointed)) return;
    const keys = subject && subject !== pointed ? [pointed, subject] : [pointed];
    const next = keys.flatMap((key) => lineSeriesIds(key));
    chart.dispatchAction({ type: "highlight", seriesId: next });
    lit.current = next;
  }, [option, pointed, subject, lines]);

  // A new layout or new saves move what the resting pointer is over: hover it afresh.
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const rehover = useRef<() => void>(() => {});
  useEffect(() => {
    rehover.current();
  }, [option]);

  const onInit = useCallback((chart: echarts.ECharts) => {
    chartRef.current = chart;
    const zr = chart.getZr();
    let pointedKey: string | null = null;
    let shown: number | null = null;
    const inside = (x: number, y: number) => {
      const { live } = latest.current;
      return (
        x >= live.left - 6 &&
        x <= live.left + live.width + 6 &&
        y >= live.top - 16 &&
        y <= live.top + live.height + 8
      );
    };
    const columnAt = (x: number) => {
      const { props, live } = latest.current;
      const day = live.from + ((x - live.left) / live.width) * (live.to - live.from);
      return nearestColumn(props.days, day, [live.from, live.to]);
    };
    const hit = (x: number, y: number) => {
      const { props, live } = latest.current;
      if (!inside(x, y)) return { column: -1, key: null };
      const column = columnAt(x);
      if (column < 0 || props.world) return { column, key: null };
      const day = live.from + ((x - live.left) / live.width) * (live.to - live.from);
      const atSave = Math.abs(live.x(props.days[column]) - x) <= 8;
      // Lines in front first; within a role, a later series is drawn over an earlier one.
      const rank = { subject: 0, compared: 1, plain: 2, grey: 3 } as const;
      const order = props.lines
        .map((line, index) => ({ line, index }))
        .sort((a, b) => rank[a.line.role] - rank[b.line.role] || b.index - a.index);
      let key: string | null = null;
      let best = 7;
      for (const { line } of order) {
        const value =
          valueNear(line, props.days, day, column) ?? (atSave ? line.values[column] : null);
        if (value === null || value === undefined) continue;
        const distance = Math.abs(live.y(value) - y);
        if (distance < best) {
          best = distance;
          key = line.key;
        }
      }
      return { column, key };
    };
    rehover.current = () => {
      const at = pointerAt.current;
      const { column } = at ? hit(at.x, at.y) : { column: -1 };
      const next = column >= 0 ? column : null;
      if (next !== shown) {
        shown = next;
        setHover(next);
      }
    };
    zr.on("mousemove", (event) => {
      pointerAt.current = { x: event.offsetX, y: event.offsetY };
      const { column, key } = hit(event.offsetX, event.offsetY);
      zr.setCursorStyle(key ? "pointer" : "default");
      const next = column >= 0 ? column : null;
      if (next !== shown) {
        shown = next;
        setHover(next);
      }
      if (key !== pointedKey) {
        pointedKey = key;
        latest.current.props.onPoint(key);
      }
    });
    zr.on("globalout", () => {
      pointerAt.current = null;
      shown = null;
      setHover(null);
      if (pointedKey !== null) {
        pointedKey = null;
        latest.current.props.onPoint(null);
      }
    });
    zr.on("click", (event) => {
      const { column, key } = hit(event.offsetX, event.offsetY);
      if (key) latest.current.props.onPick(key);
      else if (column >= 0) latest.current.props.onSelect(column);
    });
    // The strip moves the view at once: the overlay follows the event, and the view
    // is kept once the hand rests.
    let timer: ReturnType<typeof setTimeout> | undefined;
    chart.on("datazoom", (event: unknown) => {
      const raw = event as {
        batch?: { start?: number; end?: number }[];
        start?: number;
        end?: number;
      };
      const at = raw.batch?.[0] ?? raw;
      const { props } = latest.current;
      const first = props.days[0];
      const last = props.days[props.days.length - 1];
      if (at.start === undefined || at.end === undefined) return;
      // The overlay follows ECharts' own bounds; whole days are kept only once the hand rests.
      const view: [number, number] = [
        first + ((last - first) * at.start) / 100,
        first + ((last - first) * at.end) / 100,
      ];
      const base = props.view ?? [first, last];
      setDrag({ key: `${base[0]}:${base[1]}`, view });
      clearTimeout(timer);
      timer = setTimeout(() => {
        const whole = view[0] <= first && view[1] >= last;
        latest.current.props.onZoom(whole ? null : [Math.round(view[0]), Math.round(view[1])]);
        setDrag(null);
      }, 250);
    });
    return () => {
      clearTimeout(timer);
      chartRef.current = null;
    };
  }, []);

  const standingsTop = placement.layout.kind === "flow" ? TOP - 12 : 0;
  const layout = placement.layout;
  const standingsHeight =
    layout.kind === "placed"
      ? Math.max(0, ...layout.tops.map((t, i) => t + layout.heights[i]))
      : layout.height + standingsTop;
  const tableX = width - tableWidth;
  return (
    <div
      ref={wrapper}
      className="relative"
      style={{ minHeight: Math.max(chartHeight, standingsHeight + 4) }}
    >
      <EChart option={option} onInit={onInit} style={{ height: chartHeight, width: "100%" }} />
      <Marks
        width={width}
        height={Math.max(chartHeight, standingsHeight + 4)}
        map={live}
        days={days}
        lines={lines}
        rows={rows}
        values={values}
        selected={selected}
        world={world}
        subject={props.subject}
        pointed={pointed}
        comparison={props.comparison}
        placement={placement}
        scroll={scroll}
        scrollTop={scrollTop}
        listTop={standingsTop}
        tableX={tableX}
        palette={palette}
        dark={dark}
        format={props.format}
      />
      <Hover
        column={hover}
        map={live}
        days={days}
        lines={lines}
        selected={selected}
        subject={props.subject}
        pointed={pointed}
        world={world}
        palette={palette}
        dark={dark}
        format={props.format}
        fine={props.fine}
        dateOf={props.dateOf}
      />
      {!world && (
        <div className="absolute" style={{ left: tableX, width: tableWidth, top: standingsTop }}>
          <MemoStandings
            rows={rows}
            layout={placement.layout}
            label={props.label}
            narrow={narrow}
            pointed={pointed}
            focusKey={props.focusKey}
            onPick={props.onPick}
            onPoint={props.onPoint}
            onFocusRow={props.onFocusRow}
            onScroll={setScrollTop}
          />
        </div>
      )}
    </div>
  );
}

/** A line's value at a day between the two saves around it, or null where it has no join. */
function valueNear(line: ChartLine, days: readonly number[], day: number, column: number) {
  const i = days[column] <= day ? column : column - 1;
  const a = line.values[i];
  const b = line.values[i + 1];
  if (
    i < 0 ||
    i + 1 >= days.length ||
    a === null ||
    a === undefined ||
    b === null ||
    b === undefined
  )
    return null;
  return a + ((b - a) * (day - days[i])) / (days[i + 1] - days[i] || 1);
}

type MarkProps = {
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
) {
  let prev = -99;
  let run = 0;
  return entries.map((entry) => {
    run = Math.abs(entry.y - prev) < 3 ? run + 1 : 0;
    prev = entry.y;
    const radius = entry.subject ? 4.6 : 3.6;
    const edge = edgeFor(entry.color, dark, palette.ground);
    return run > 0
      ? { ...entry, ring: true, r: radius + 3 * run, stroke: entry.color, width: 1.5 }
      : { ...entry, ring: false, r: radius, stroke: edge ?? palette.ground, width: edge ? 1 : 1.5 };
  });
}

const Marks = memo(function Marks(p: MarkProps) {
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
    far && p.placement.tight && !p.scroll && live.length > 1 && p.placement.layout.kind === "placed"
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
  );

  // A line that ended before the selected save keeps its flag at its last value (D5).
  const ended = lines.flatMap((line) => {
    const last = line.values.findLastIndex((v) => v !== null);
    if (last < 0 || last >= sel || line.role === "grey") return [];
    const x = map.x(days[last]);
    if (!clip(x)) return [];
    const back =
      emphasis && line.key !== p.pointed && line.role !== "subject" && line.role !== "compared";
    return [
      {
        key: line.key,
        x,
        y: map.y(line.values[last]!),
        tag: line.tags[last] ?? "",
        name: line.names[last] ?? "",
        opacity: line.key === p.pointed ? 1 : back ? 0.3 : 0.6,
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
        {since !== null && sinceValue !== null && clip(map.x(days[since])) && (
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

type HoverProps = {
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
const Hover = memo(function Hover(p: HoverProps) {
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
      {!p.world &&
        shown.map(({ line }, i) => {
          const emphasized = line.key === p.pointed;
          const bold = emphasized || line.key === p.subject;
          return (
            <div
              key={line.key}
              aria-hidden
              className={`pointer-events-none absolute flex items-center gap-1 text-xs whitespace-nowrap text-gray-950 tabular-nums dark:text-white ${bold ? "font-bold" : "font-semibold"} ${left ? "flex-row-reverse" : ""}`}
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
