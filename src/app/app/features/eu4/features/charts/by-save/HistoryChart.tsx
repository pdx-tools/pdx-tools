import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as echarts from "echarts/core";
import { EChart } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { placeRows, saveYearLabels, valueScale } from "./history";
import type { ValueScale } from "./history";
import { historyOption, lineSeriesIds, nearestColumn, palettes, plotMap } from "./historyOption";
import type { ChartLine, Comparison } from "./historyOption";
import { Hover, Marks, ROW, TOP } from "./HistoryOverlay";
import { Standings, secondLine } from "./Standings";
import type { StandingRow, StandingsLayout } from "./Standings";
import { timeTicks } from "./timeTicks";

const AXIS = 34;
const SLIDER = 22;
/** Rows that would move further than this from their values stand as a list. */
const MOST_PUSH = 40;
/** Above this many rows, the standings scroll. */
const MOST_PLACED = 20;
/** With more saves than this, the zoom strip shows at rest (D5). */
const STRIP_SAVES = 40;

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
  /** The standings row with keyboard focus now. */
  focused?: string | null;
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
  const zoomed = props.view !== null;
  const slider = n > STRIP_SAVES || zoomed;
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
        // Whole rows only, so the followed row held at an edge covers no half row.
        layout: { kind: "flow", height: Math.floor((plotHeight + 24) / ROW) * ROW, rowHeight: ROW },
        centers: [],
        tight: true,
      };
    const live = rows.filter((row) => !row.gone);
    const heightsFor = (tight: boolean) =>
      live.map(
        (row) =>
          (many || tight ? ROW : narrow ? 26 : 28) +
          (!tight && !many && !narrow && secondLine(row) ? 10 : 0),
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
      // Tight rows that stand away from their values, or are seen from far off, are a list:
      // a bracket and a caption say so (D5).
      layout: {
        kind: "placed",
        tops,
        heights: allHeights,
        tight,
        listed: tight && (far || placed.push > MOST_PUSH),
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
        zoomed,
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
      zoomed,
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

  // The canvas follows a zoom set by the keys or a chip, also one equal to the last option.
  useEffect(() => {
    chartRef.current?.dispatchAction({ type: "dataZoom", startValue: from, endValue: to });
  }, [from, to]);

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
      const { column, key } = at ? hit(at.x, at.y) : { column: -1, key: null };
      const next = column >= 0 ? column : null;
      if (next !== shown) {
        shown = next;
        setHover(next);
      }
      // The line under a resting pointer can change too.
      if (at && key !== pointedKey) {
        pointedKey = key;
        zr.setCursorStyle(key ? "pointer" : "default");
        latest.current.props.onPoint(key);
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
      // The overlay follows the bounds ECharts applied; whole days are kept once the hand rests.
      const applied = (
        chart.getOption() as { dataZoom?: { startValue?: number; endValue?: number }[] }
      ).dataZoom?.[0];
      const view: [number, number] = [
        applied?.startValue ?? first + ((last - first) * at.start) / 100,
        applied?.endValue ?? first + ((last - first) * at.end) / 100,
      ];
      const base = props.view ?? [first, last];
      const key = `${base[0]}:${base[1]}`;
      setDrag({ key, view });
      clearTimeout(timer);
      timer = setTimeout(() => {
        // A zoom set meanwhile, by the keys or a chip, wins over this drag.
        const now = latest.current.props.view ?? [first, last];
        if (`${now[0]}:${now[1]}` === key) {
          const whole = view[0] <= first && view[1] >= last;
          latest.current.props.onZoom(whole ? null : [Math.round(view[0]), Math.round(view[1])]);
        }
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
        sparse={sparse && !world}
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
            focused={props.focused}
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
