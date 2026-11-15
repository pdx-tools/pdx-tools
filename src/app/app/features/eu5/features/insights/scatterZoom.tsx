import { useEffectEvent, useRef, useState } from "react";
import * as echarts from "echarts/core";
import type { EChartsOption } from "@/components/viz";
import { chartInk, neutralFill } from "@/components/viz/echartsTheme";
import { GameButton } from "../../components";

/**
 * The space around the plot of a scatter. The plot does not move for long
 * tick text, because the box zoom and the labels find it by these numbers.
 */
export const SCATTER_GRID = {
  left: 56,
  right: 24,
  top: 32,
  bottom: 44,
  outerBoundsMode: "none",
} as const;

/** A drag must be this many px wide and high to zoom */
const MIN_BOX = 8;

/** ECharts takes a move of this many px or less from the press as a click */
const CLICK_SLOP = 4;

/** A name of a log axis says so, because the shape of the dots depends on it. */
const LOG_SUFFIX = ", log scale";
export const logName = (name: string) => `${name}${LOG_SUFFIX}`;

/** A zoom of a log axis that spans less than this ratio is linear, so that it has ticks. */
const LOG_ZOOM_RATIO = 30;

const tidy = (value: number) => Number(value.toPrecision(12));

/**
 * The ends of a linear axis zoomed to `lo`..`hi`: the roundest values that
 * add at most a tenth of the range at each end. A box that starts above 0
 * does not go down to 0, because the box left out the dots there.
 */
export function linearZoom(lo: number, hi: number): { min: number; max: number } {
  const range = hi - lo;
  const slack = range / 10;
  const top = 10 ** Math.ceil(Math.log10(range));
  // A step at or under the slack always fits, so four decades are enough.
  for (let i = 0; i <= 4 && top > 0 && Number.isFinite(top); i++) {
    for (const m of [5, 2.5, 2, 1]) {
      const step = (m * top) / 10 ** i;
      if (!(step > 0)) continue;
      const min = tidy(Math.floor(lo / step) * step);
      const max = tidy(Math.ceil(hi / step) * step);
      const fits = min <= lo && lo - min <= slack && hi <= max && max - hi <= slack;
      if (fits && min < max && !(lo > 0 && min <= 0)) return { min, max };
    }
  }
  // A box too small to round keeps its own ends.
  return { min: lo, max: hi };
}

/** The ends of a log axis zoomed to `lo`..`hi`: 1, 2 or 5 times a power of 10 */
export function logZoom(lo: number, hi: number): { min: number; max: number } {
  const decade = (v: number) => 10 ** Math.floor(Math.log10(v));
  const down = decade(lo);
  const up = decade(hi);
  const min = tidy(([5, 2, 1].find((m) => m * down <= lo * (1 + 1e-9)) ?? 1) * down);
  const max = tidy(([1, 2, 5, 10].find((m) => m * up >= hi * (1 - 1e-9)) ?? 10) * up);
  // A box too small to round keeps its own ends.
  const holds = min > 0 && Number.isFinite(max) && min < max && min <= lo && hi <= max;
  return holds ? { min, max } : { min: lo, max: hi };
}

interface AxisOption {
  type?: string;
  name?: string;
  min?: unknown;
  axisLabel?: object;
}

/**
 * The axes of a scatter zoomed to a box. A log axis stays log only when the
 * box spans a ratio of 30 or more, or has the floor. Two log axes, which
 * share one scale, both stay log or both become linear, so that a diagonal
 * stays straight.
 */
export function zoomedAxes<X extends AxisOption, Y extends AxisOption>(
  axes: { x: X; y: Y },
  range: { x: [number, number]; y: [number, number] },
): { x: X; y: Y } {
  // A log axis has values at 0 or under on its floor. A box with the floor
  // stays log, because a linear axis would show them at the floor's value.
  const staysLog = (axis: AxisOption, [lo, hi]: [number, number]) =>
    axis.type === "log" &&
    (hi / lo >= LOG_ZOOM_RATIO ||
      (typeof axis.min === "number" && linearZoom(lo, hi).min <= axis.min * (1 + 1e-9)));
  let logX = staysLog(axes.x, range.x);
  let logY = staysLog(axes.y, range.y);
  if (axes.x.type === "log" && axes.y.type === "log") logX = logY = logX || logY;

  const zoom = <A extends AxisOption>(axis: A, [lo, hi]: [number, number], log: boolean): A => {
    const label = { ...axis.axisLabel, showMinLabel: true, showMaxLabel: true };
    if (log) {
      // The floor holds the values at 0 or under, so the zoom does not go under it.
      const floor = typeof axis.min === "number" ? axis.min : 0;
      const ends = logZoom(Math.max(lo, floor), hi);
      return { ...axis, min: Math.max(ends.min, floor), max: ends.max, axisLabel: label };
    }
    const name = axis.name?.endsWith(LOG_SUFFIX)
      ? axis.name.slice(0, -LOG_SUFFIX.length)
      : axis.name;
    // Tick text has three digits, so a zoom spans at least 5% of its values.
    const extra = Math.max(0, 0.05 * Math.max(Math.abs(lo), Math.abs(hi)) - (hi - lo)) / 2;
    const ends = linearZoom(lo - extra, hi + extra);
    return { ...axis, type: "value", name, ...ends, axisLabel: label };
  };
  return { x: zoom(axes.x, range.x, logX), y: zoom(axes.y, range.y, logY) };
}

type Pixel = [number, number];

function plotOf(chart: echarts.ECharts) {
  return {
    left: SCATTER_GRID.left,
    top: SCATTER_GRID.top,
    right: chart.getWidth() - SCATTER_GRID.right,
    bottom: chart.getHeight() - SCATTER_GRID.bottom,
  };
}

function boxOf(a: Pixel, b: Pixel) {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    width: Math.abs(a[0] - b[0]),
    height: Math.abs(a[1] - b[1]),
  };
}

type ScatterOption = EChartsOption | ((chart: echarts.ECharts) => EChartsOption);

const resolve = (option: ScatterOption, chart: echarts.ECharts) =>
  typeof option === "function" ? option(chart) : option;

/**
 * Drag a box over a scatter to zoom each axis to the box: the chart draws
 * again with its option and new ends on the axes. `option` is the option of
 * the chart, with one x axis and one y axis. A new option draws the chart
 * again with no zoom.
 */
export function useBoxZoom(option: ScatterOption) {
  // The option that the zoom is for. In a box, because an option can be a function.
  const [zoomedFor, setZoomedFor] = useState<{ option: ScatterOption } | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const zoomChart = useEffectEvent(
    (chart: echarts.ECharts, range: { x: [number, number]; y: [number, number] }) => {
      const base = resolve(option, chart);
      if (Array.isArray(base.xAxis) || Array.isArray(base.yAxis)) return;
      const axes = zoomedAxes({ x: base.xAxis ?? {}, y: base.yAxis ?? {} }, range);
      chart.setOption({ ...base, xAxis: axes.x, yAxis: axes.y }, { notMerge: true });
      setZoomedFor({ option });
    },
  );

  const attach = (chart: echarts.ECharts) => {
    chartRef.current = chart;
    // A new chart starts with no zoom, such as after a change of theme.
    setZoomedFor(null);
    const zr = chart.getZr();
    const dom = chart.getDom();
    let drag: { pointerId: number; start: Pixel; end: Pixel | null } | null = null;
    let box: echarts.graphic.Rect | null = null;

    const local = (ev: PointerEvent): Pixel => {
      const rect = dom.getBoundingClientRect();
      return [ev.clientX - rect.left, ev.clientY - rect.top];
    };

    const clamp = ([x, y]: Pixel): Pixel => {
      const plot = plotOf(chart);
      return [
        Math.min(Math.max(x, plot.left), plot.right),
        Math.min(Math.max(y, plot.top), plot.bottom),
      ];
    };

    const noSelect = (ev: Event) => ev.preventDefault();

    /** Ends the drag with no zoom */
    const stop = () => {
      if (drag && dom.hasPointerCapture(drag.pointerId)) dom.releasePointerCapture(drag.pointerId);
      drag = null;
      if (box && !chart.isDisposed()) zr.remove(box);
      box = null;
      document.removeEventListener("selectstart", noSelect);
    };

    const zoomTo = (drawn: ReturnType<typeof boxOf>) => {
      const corner = (pixel: Pixel) => chart.convertFromPixel({ gridIndex: 0 }, pixel) as number[];
      const [x0 = 0, y0 = 0] = corner([drawn.x, drawn.y + drawn.height]);
      const [x1 = 0, y1 = 0] = corner([drawn.x + drawn.width, drawn.y]);
      zoomChart(chart, { x: [x0, x1], y: [y0, y1] });

      // The release of the drag is also a click, which must not select the dot under it.
      const swallow = (ev: MouseEvent) => ev.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };

    // The element stays for the next chart after a change of theme, so the
    // listeners go with this chart. A drag can leave the chart before the
    // chart takes the pointer, so its moves come from the document.
    const listeners = new AbortController();
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (ev: HTMLElementEventMap[K]) => void,
      target: HTMLElement | Document = dom,
    ) => target.addEventListener(type, handler as EventListener, { signal: listeners.signal });

    // A new press, or a switch to another window, ends a drag whose release
    // did not come, so that no other chart's drag takes its moves.
    document.addEventListener("pointerdown", stop, { capture: true, signal: listeners.signal });
    window.addEventListener("blur", stop, { signal: listeners.signal });

    on("pointerdown", (ev) => {
      if (!ev.isPrimary || ev.button !== 0) return;
      const at = local(ev);
      const plot = plotOf(chart);
      if (at[0] < plot.left || at[0] > plot.right || at[1] < plot.top || at[1] > plot.bottom) {
        return;
      }
      // No capture yet, so that a click stays on the dot under it.
      drag = { pointerId: ev.pointerId, start: at, end: null };
    });

    on(
      "pointermove",
      (ev) => {
        if (drag?.pointerId !== ev.pointerId) return;
        // A release that did not come here ends the drag with no zoom.
        if ((ev.buttons & 1) === 0) {
          stop();
          return;
        }
        const at = local(ev);
        if (!drag.end) {
          if (Math.hypot(at[0] - drag.start[0], at[1] - drag.start[1]) <= CLICK_SLOP) return;
          // A drag: the chart keeps the pointer until the release.
          dom.setPointerCapture(ev.pointerId);
          chart.dispatchAction({ type: "hideTip" });
          document.addEventListener("selectstart", noSelect);
        }
        drag.end = clamp(at);
        const shape = boxOf(drag.start, drag.end);
        if (box) {
          box.setShape(shape);
        } else {
          box = new echarts.graphic.Rect({
            shape,
            style: {
              fill: neutralFill,
              stroke: chartInk.secondary,
              lineWidth: 1,
              lineDash: [4, 3],
            },
            silent: true,
            z: 100,
          });
          zr.add(box);
        }
      },
      document,
    );

    on(
      "pointerup",
      (ev) => {
        if (drag?.pointerId !== ev.pointerId) return;
        // The box goes to the release, which can come with no move before it.
        const drawn = boxOf(drag.start, clamp(local(ev)));
        stop();
        if (drawn.width >= MIN_BOX && drawn.height >= MIN_BOX) zoomTo(drawn);
      },
      document,
    );

    // A touch that scrolls the page cancels the box.
    const cancel = (ev: PointerEvent) => {
      if (drag?.pointerId === ev.pointerId) stop();
    };
    on("pointercancel", cancel, document);
    // Only the capture of the chart: a pen also loses its first capture, on
    // the canvas, when the chart takes the pointer.
    on("lostpointercapture", (ev) => {
      if (ev.target === dom) cancel(ev);
    });

    return () => {
      stop();
      listeners.abort();
    };
  };

  const reset = () => {
    const chart = chartRef.current;
    if (chart && !chart.isDisposed()) chart.setOption(resolve(option, chart), { notMerge: true });
    setZoomedFor(null);
  };

  return { attach, zoomed: zoomedFor?.option === option, reset };
}

/** The hint under a scatter that has a box zoom */
export const BOX_ZOOM_HINT = "Drag over dots to zoom in.";

/** A button over the top right of a zoomed scatter */
export function ResetZoom({ zoom }: { zoom: ReturnType<typeof useBoxZoom> }) {
  if (!zoom.zoomed) return null;
  return (
    <GameButton className="absolute top-0 right-6" onClick={zoom.reset}>
      Reset zoom
    </GameButton>
  );
}
