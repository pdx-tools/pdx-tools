import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as echarts from "echarts/core";
import { EChart } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { placeRows, saveYearLabels, valueScale } from "./history";
import type { ValueScale } from "./history";
import { historyOption, nearestColumn, palettes } from "./historyOption";
import type { ChartLine, Comparison, Leader } from "./historyOption";
import { Standings } from "./Standings";
import type { StandingRow, StandingsLayout } from "./Standings";
import { timeTicks } from "./timeTicks";

/** The plot's top edge: room for the caps over the rules. */
const TOP = 22;
const AXIS = 34;
const SLIDER = 30;
/** Rows that would move further than this from their values stand as a list. */
const MOST_PUSH = 40;
/** Above this many rows, the standings scroll. */
const MOST_PLACED = 20;

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
  /** Show the zoom slider at rest. */
  slider: boolean;
  sparse: boolean;
  long: (gap: number) => boolean;
  comparison: Comparison | null;
  format: (value: number) => string;
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

/**
 * The history chart: a line for each country on one value scale, drawn by
 * ECharts, and the standings beside it in HTML, placed at the height of
 * each value where that needs little nudging.
 */
export function HistoryChart(props: HistoryChartProps) {
  const { days, lines, rows, values, world, selected } = props;
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const measure = () => setWidth(Math.floor(element.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const dark = isDarkMode();
  const palette = palettes[dark ? "dark" : "light"];
  const { fitted, sparse, long, dots, open, comparison, format, tick, yearOf, dateOf } = props;
  const narrow = width < 600;
  const n = days.length;
  const from = props.view?.[0] ?? days[0];
  const to = props.view?.[1] ?? days[n - 1];

  const scroll = rows.length > MOST_PLACED;
  const many = lines.length > 12;
  const tableWidth = world ? 0 : narrow ? 188 : 232;
  const fan = world ? (narrow ? 76 : 104) : narrow ? 24 : 40;
  const left = 46;
  const plotWidth = Math.max(80, width - left - tableWidth - fan);
  const liveCount = rows.filter((row) => !row.gone).length;
  const plotHeight = world
    ? narrow
      ? 220
      : 280
    : Math.max(narrow ? 300 : 360, many && !scroll ? 21 * liveCount - 20 : 0);

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

  // Rows stand beside their values when that takes little nudging, else as a tight list.
  const placement = useMemo((): { layout: StandingsLayout; centers: number[] } => {
    if (world || scroll) return { layout: { kind: "flow", height: plotHeight + 24 }, centers: [] };
    const live = rows.filter((row) => !row.gone);
    const yPx = (value: number) =>
      TOP + plotHeight * (1 - (value - scale.lo) / (scale.hi - scale.lo || 1));
    const heightsFor = (tight: boolean) =>
      live.map(
        (row) => (many || tight ? 20 : narrow ? 26 : 28) + (!tight && !many && row.note ? 10 : 0),
      );
    const wants = live.map((row) => yPx(values[rows.indexOf(row)] ?? 0));
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
    // Rows still far from their values read as a list, and say so.
    const listed = placed.push > MOST_PUSH;
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
      layout: { kind: "placed", tops, heights: allHeights, tight, listed, rows: live.length },
      centers: placed.tops.map((t, i) => t + heights[i] / 2),
    };
  }, [rows, values, plotHeight, scale, narrow, many, scroll, world]);

  const leaders = useMemo((): Leader[] | null => {
    if (world || placement.layout.kind !== "placed") return null;
    return rows
      .filter((row) => !row.gone)
      .map((row, i) => ({
        value: values[rows.indexOf(row)] ?? 0,
        rowY: placement.centers[i],
        color: row.color,
        role: row.role,
        back: row.back,
      }));
  }, [placement, rows, values, world]);

  const xLabels = useMemo(() => {
    const inView = days.flatMap((day, i) => (day >= from && day <= to ? [i] : []));
    const pxPerDay = plotWidth / Math.max(1, to - from);
    if (sparse || inView.length <= 12) {
      const xs = inView.map((i) => (days[i] - from) * pxPerDay);
      const at = inView.indexOf(selected);
      const kept = saveYearLabels(xs, at >= 0 ? at : 0, 38);
      return { kind: "saves" as const, columns: kept.map((k) => inView[k]) };
    }
    const { ticks } = timeTicks(from, to, 0);
    // Keep labels clear of each other at this width.
    const room = Math.max(1, Math.ceil((38 * ticks.length) / plotWidth));
    return { kind: "ticks" as const, days: ticks.filter((_, i) => i % room === 0) };
  }, [days, from, to, plotWidth, sparse, selected]);

  const font = useMemo(
    () =>
      typeof window === "undefined" ? "sans-serif" : getComputedStyle(document.body).fontFamily,
    [],
  );
  const slider = props.slider || props.view !== null;
  const option = useMemo(
    () =>
      historyOption({
        days,
        lines,
        world,
        dots,
        selected,
        open,
        view: [from, to],
        slider,
        scale,
        grid: { left, right: width - left - plotWidth, top: TOP, height: plotHeight },
        fan,
        plotWidth,
        sparse,
        long,
        xLabels,
        yearOf,
        dateOf,
        leaders,
        comparison,
        palette,
        dark,
        format,
        tick,
        font,
      }),
    [
      days,
      lines,
      world,
      dots,
      selected,
      open,
      from,
      to,
      slider,
      scale,
      width,
      plotWidth,
      plotHeight,
      fan,
      sparse,
      long,
      xLabels,
      yearOf,
      dateOf,
      leaders,
      comparison,
      palette,
      dark,
      format,
      tick,
      font,
    ],
  );
  const view: [number, number] = [from, to];

  // The chart's events read the latest props without rebinding.
  const latest = useRef({ props, view, scale, plotHeight });
  useLayoutEffect(() => {
    latest.current = { props, view, scale, plotHeight };
  });
  // A new option clears the hover; the pointer that is still there brings it back.
  const chartRef = useRef<echarts.ECharts | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const hover = useRef<(at: { x: number; y: number } | null) => void>(() => {});
  useEffect(() => {
    hover.current(pointer.current);
  }, [option]);
  const onInit = useCallback((chart: echarts.ECharts) => {
    const zr = chart.getZr();
    chartRef.current = chart;
    let pointed: string | null = null;
    const hit = (x: number, y: number) => {
      const { props, view } = latest.current;
      if (!chart.containPixel({ gridIndex: 0 }, [x, y])) return { column: -1, key: null };
      const [day] = chart.convertFromPixel({ gridIndex: 0 }, [x, y]) as number[];
      const column = nearestColumn(props.days, day, view);
      if (column < 0 || props.world) return { column, key: null };
      // A line within a few pixels of the pointer, at the nearest save or between two.
      let key: string | null = null;
      let best = 7;
      const [columnX] = chart.convertToPixel({ gridIndex: 0 }, [props.days[column], 0]) as number[];
      const atSave = Math.abs(columnX - x) <= 8;
      // Lines in front first, so a tie goes to the one drawn on top.
      const rank = { subject: 0, compared: 1, plain: 2, grey: 3 } as const;
      // Within a role, a later series is drawn over an earlier one.
      const lines = props.lines
        .map((line, index) => ({ line, index }))
        .sort((a, b) => rank[a.line.role] - rank[b.line.role] || b.index - a.index)
        .map((x) => x.line);
      for (const line of lines) {
        // Only what is drawn: a join between two values, or a dot near the pointer.
        const value =
          valueNear(line, props.days, day, column) ?? (atSave ? line.values[column] : null);
        if (value === null) continue;
        const [, py] = chart.convertToPixel({ gridIndex: 0 }, [day, value]) as number[];
        const distance = Math.abs(py - y);
        if (distance < best) {
          best = distance;
          key = line.key;
        }
      }
      return { column, key };
    };
    let shown = -1;
    // The hover is driven from here: one save in view, chosen once, places the rule and
    // every highlight. Each call leaves first, as the pointer keeps what it highlighted.
    hover.current = (at) => {
      chart.dispatchAction({ type: "updateAxisPointer", currTrigger: "leave" });
      shown = -1;
      if (!at || !chart.containPixel({ gridIndex: 0 }, [at.x, at.y])) return;
      const { props, view } = latest.current;
      const [day] = chart.convertFromPixel({ gridIndex: 0 }, [at.x, at.y]) as number[];
      const column = nearestColumn(props.days, day, view);
      if (column < 0) return;
      shown = column;
      const [x] = chart.convertToPixel({ gridIndex: 0 }, [props.days[column], 0]) as number[];
      chart.dispatchAction({ type: "updateAxisPointer", currTrigger: "mousemove", x, y: at.y });
    };
    zr.on("mousemove", (event) => {
      pointer.current = { x: event.offsetX, y: event.offsetY };
      const { props, view } = latest.current;
      const [day] = chart.convertFromPixel({ gridIndex: 0 }, [
        event.offsetX,
        event.offsetY,
      ]) as number[];
      const inside = chart.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY]);
      const column = inside ? nearestColumn(props.days, day, view) : -1;
      if (column !== shown) hover.current(column < 0 ? null : pointer.current);
      const { key } = hit(event.offsetX, event.offsetY);
      zr.setCursorStyle(key ? "pointer" : "default");
      if (key !== pointed) {
        pointed = key;
        latest.current.props.onPoint(key);
      }
    });
    zr.on("globalout", () => {
      pointer.current = null;
      hover.current(null);
      if (pointed !== null) {
        pointed = null;
        latest.current.props.onPoint(null);
      }
    });
    zr.on("click", (event) => {
      const { column, key } = hit(event.offsetX, event.offsetY);
      if (key) latest.current.props.onPick(key);
      else if (column >= 0) latest.current.props.onSelect(column);
    });
    // The slider moves the view; the chart reports it once the hand rests.
    let timer: ReturnType<typeof setTimeout> | undefined;
    chart.on("datazoom", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const zoom = (
          chart.getOption() as { dataZoom?: { startValue?: number; endValue?: number }[] }
        ).dataZoom?.[0];
        const { props } = latest.current;
        const first = props.days[0];
        const last = props.days[props.days.length - 1];
        if (zoom?.startValue === undefined || zoom.endValue === undefined) return;
        const whole = zoom.startValue <= first && zoom.endValue >= last;
        props.onZoom(whole ? null : [Math.round(zoom.startValue), Math.round(zoom.endValue)]);
      }, 250);
    });
    return () => {
      clearTimeout(timer);
      chartRef.current = null;
      hover.current = () => {};
    };
  }, []);

  const chartHeight = TOP + plotHeight + AXIS + (slider ? SLIDER : 0);
  const layout = placement.layout;
  const standingsHeight =
    layout.kind === "placed" ? Math.max(0, ...layout.tops.map((t, i) => t + layout.heights[i])) : 0;
  return (
    <div
      ref={wrapper}
      className="relative"
      style={{ minHeight: Math.max(chartHeight, standingsHeight + 4) }}
    >
      <EChart
        option={option}
        onInit={onInit}
        style={{ height: chartHeight, width: "100%" }}
        className="history-chart"
      />
      {!world && (
        <div
          className="absolute"
          style={{
            left: width - tableWidth,
            width: tableWidth,
            top: placement.layout.kind === "flow" ? TOP - 12 : 0,
          }}
        >
          <Standings
            rows={rows}
            layout={placement.layout}
            label={props.label}
            narrow={narrow}
            focusKey={props.focusKey}
            onPick={props.onPick}
            onPoint={props.onPoint}
            onFocusRow={props.onFocusRow}
          />
        </div>
      )}
    </div>
  );
}

/** A line's value at a day: at the nearest save, or between the two saves around it. */
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
