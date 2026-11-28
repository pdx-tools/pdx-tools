import {
  CHART_UPDATE_DURATION,
  clampedProgress,
  createFrameLoop,
  interpolate,
  prefersReducedMotion,
} from "./chartMotion";
import {
  findZLevelCanvas,
  getChartModel,
  isGraphicAttached,
  readTargetBarShape,
  refreshZRenderImmediately,
  setGraphicHidden,
  setZRenderCursor,
  stopUnlabeledBarShapeAnimators,
} from "./echartsInternals";
import type { BarRectGraphic, Cartesian2DCoord } from "./echartsInternals";
import * as echarts from "echarts/core";
import type { EChartsOption } from "./EChart";

type Box = [number, number, number, number];
type Radii = [number, number, number, number];

type Bar = {
  key: string;
  from: Box;
  to: Box;
  base: Box;
  clip: Box;
  fill: string | null;
  stroke: string | null;
  opacity: number;
  radius: Radii;
  border: number;
  fromAlpha: number;
  toAlpha: number;
  seriesIndex: number;
  params: echarts.ECElementEvent;
  focusSeries: boolean;
  silent: boolean;
};

const interpolateBox = (bar: Bar, t: number): Box => [
  interpolate(bar.from[0], bar.to[0], t),
  interpolate(bar.from[1], bar.to[1], t),
  interpolate(bar.from[2], bar.to[2], t),
  interpolate(bar.from[3], bar.to[3], t),
];

function validatePaint(value: unknown): string | null {
  if (value == null || value === "none") return null;
  if (typeof value !== "string") throw new Error("Unsupported bar paint");
  if (!echarts.color.parse(value)) throw new Error("Unsupported bar color");
  return value;
}

function compareClip(a: Box, b: Box): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];
}

function sameClip(a: Box, b: Box): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** Cartesian rect bars only; mixed/polar/large charts retain their regular ECharts renderer. */
export function supportsBarOverlay(option: EChartsOption) {
  const series = Array.isArray(option.series) ? option.series : [option.series];
  return (
    series.length > 0 &&
    series.every(
      (s) =>
        s?.type === "bar" &&
        (!s.coordinateSystem || s.coordinateSystem === "cartesian2d") &&
        !s.large &&
        !s.realtimeSort &&
        !s.zlevel &&
        s.clip !== false &&
        s.animation !== false &&
        !s.universalTransition,
    )
  );
}

/**
 * Promote bar series and their attached markers (markLine/markPoint/markArea) to zlevel 1
 * so gridlines (zlevel 0) stay underneath the bar overlay and labels/markers stay above it.
 */
export function barOverlayOption(option: EChartsOption): EChartsOption {
  const series = Array.isArray(option.series) ? option.series : [option.series];
  return {
    ...option,
    series: series.map((s) => {
      if (!s || s.type !== "bar") return s;
      return {
        ...s,
        zlevel: 1,
        ...(s.markLine ? { markLine: { ...s.markLine, zlevel: 1 } } : {}),
        ...(s.markPoint ? { markPoint: { ...s.markPoint, zlevel: 1 } } : {}),
        ...(s.markArea ? { markArea: { ...s.markArea, zlevel: 1 } } : {}),
      };
    }),
  } as EChartsOption;
}

/**
 * ECharts computes grouping, stacking, zoom, axes, and labels; a lightweight 2D Canvas
 * overlay animates the bars so axes/gridlines stay static without consuming WebGL contexts.
 */
export function createBarOverlay(chart: echarts.ECharts, fallback: () => void) {
  const container = chart.getDom();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  canvas.dataset.renderer = "bar-overlay";
  canvas.style.cssText = "position:absolute;inset:0;pointer-events:none";

  let active = false;
  let bars: Bar[] = [];
  let batches: { clip: Box; start: number; end: number }[] = [];
  const hidden = new Map<BarRectGraphic, { invisible: boolean; silent: boolean }>();
  let option: EChartsOption | undefined;
  let started = 0;
  let duration = 0;
  let paused = false;
  let hoveredIndex = -1;
  let tipShown = false;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let canvasRatio = 0;
  const radiiScratch: Radii = [0, 0, 0, 0];

  const params = (bar: Bar, event?: MouseEvent) =>
    ({ ...bar.params, ...(event ? { event: { event } } : {}) }) as echarts.ECElementEvent;

  const clearHover = () => {
    if (hoveredIndex >= 0 && bars[hoveredIndex]) {
      chart.trigger("mouseout", params(bars[hoveredIndex]!));
      setZRenderCursor(chart, "default");
    }
    if (tipShown) {
      chart.dispatchAction({ type: "hideTip" });
      tipShown = false;
    }
    hoveredIndex = -1;
  };

  const restore = () => {
    for (const [element, { invisible, silent }] of hidden) {
      setGraphicHidden(element, invisible, silent);
    }
  };

  const render = (now: number): boolean => {
    if (paused) return false;
    const ratio = window.devicePixelRatio || 1;
    const width = chart.getWidth();
    const height = chart.getHeight();
    if (width <= 0 || height <= 0) return false;

    if (width !== canvasWidth || height !== canvasHeight || ratio !== canvasRatio) {
      canvasWidth = width;
      canvasHeight = height;
      canvasRatio = ratio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const t = clampedProgress(started, duration, now);
    const hoveredBar = hoveredIndex >= 0 ? bars[hoveredIndex] : undefined;
    const focusSeriesIndex = hoveredBar?.focusSeries ? hoveredBar.seriesIndex : -1;

    for (const batch of batches) {
      const [cx, cy, cw, ch] = batch.clip;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cw, ch);
      ctx.clip();

      let lastFill: string | null = null;
      let lastStroke: string | null = null;
      let lastAlpha = -1;

      for (let i = batch.start; i < batch.end; i++) {
        const bar = bars[i]!;
        let alpha = interpolate(bar.fromAlpha, bar.toAlpha, t);
        if (focusSeriesIndex >= 0 && bar.seriesIndex !== focusSeriesIndex) alpha *= 0.1;
        if (alpha <= 0.001) continue;

        const x = interpolate(bar.from[0], bar.to[0], t);
        const y = interpolate(bar.from[1], bar.to[1], t);
        const w = interpolate(bar.from[2], bar.to[2], t);
        const h = interpolate(bar.from[3], bar.to[3], t);
        if (w <= 0 || h <= 0) continue;

        const effectiveAlpha = alpha * bar.opacity;
        if (effectiveAlpha !== lastAlpha) {
          ctx.globalAlpha = effectiveAlpha;
          lastAlpha = effectiveAlpha;
        }

        const [r0, r1, r2, r3] = bar.radius;
        const hasRadius = r0 > 0 || r1 > 0 || r2 > 0 || r3 > 0;
        const isHovered = i === hoveredIndex;
        const strokeWidth = bar.border > 0 && bar.stroke ? Math.min(bar.border, w, h) : 0;

        if (!hasRadius && !isHovered && strokeWidth <= 0) {
          if (bar.fill) {
            if (bar.fill !== lastFill) {
              ctx.fillStyle = bar.fill;
              lastFill = bar.fill;
            }
            ctx.fillRect(x, y, w, h);
          }
          continue;
        }

        ctx.beginPath();
        if (hasRadius && typeof ctx.roundRect === "function") {
          const maxR = Math.min(w, h) * 0.5;
          radiiScratch[0] = Math.min(r0, maxR);
          radiiScratch[1] = Math.min(r1, maxR);
          radiiScratch[2] = Math.min(r2, maxR);
          radiiScratch[3] = Math.min(r3, maxR);
          ctx.roundRect(x, y, w, h, radiiScratch);
        } else {
          ctx.rect(x, y, w, h);
        }

        if (bar.fill) {
          if (bar.fill !== lastFill) {
            ctx.fillStyle = bar.fill;
            lastFill = bar.fill;
          }
          ctx.fill();
          if (isHovered) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
            lastFill = "rgba(255, 255, 255, 0.1)";
            ctx.fill();
          }
        }
        if (strokeWidth > 0 && bar.stroke) {
          if (bar.stroke !== lastStroke) {
            ctx.strokeStyle = bar.stroke;
            lastStroke = bar.stroke;
          }
          ctx.lineWidth = strokeWidth;
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    return Boolean(duration && now - started < duration);
  };

  const loop = createFrameLoop(render);

  const deactivate = () => {
    if (!active) return;
    active = false;
    loop.stop();
    clearHover();
    restore();
    hidden.clear();
    bars = [];
    batches = [];
    option = undefined;
    duration = 0;
    canvas.remove();
  };

  const update = (next: EChartsOption, animate = true) => {
    const first = !option;
    active = true;
    option = next;
    const t = clampedProgress(started, duration, performance.now());
    const old = new Map(
      bars.map((b) => [
        b.key,
        { ...b, from: interpolateBox(b, t), fromAlpha: interpolate(b.fromAlpha, b.toAlpha, t) },
      ]),
    );
    clearHover();

    const collected: Bar[] = [];
    const elements: BarRectGraphic[] = [];
    try {
      const model = getChartModel(chart);
      if (!model) throw new Error("Missing chart model");
      model.eachSeries((series) => {
        if (series.subType !== "bar" || series.coordinateSystem?.type !== "cartesian2d") {
          throw new Error("Unsupported bar layout");
        }
        const coord = series.coordinateSystem as Cartesian2DCoord;
        const grid = coord.master.getRect();
        const clip: Box = [grid.x, grid.y, grid.width, grid.height];
        const baseAxis = coord.getBaseAxis();
        const horizontal = baseAxis.dim === "y";
        const focusSeries = series.get(["emphasis", "focus"]) === "series";
        const silent = series.get("silent") === true;
        const data = series.getData();

        for (let i = 0; i < data.count(); i++) {
          const element = data.getItemGraphicEl(i) as BarRectGraphic | undefined;
          if (!element || element.ignore) continue;
          if (element.type !== "rect" || element.style.shadowBlur || element.style.lineDash) {
            throw new Error("Unsupported bar shape");
          }
          const s = readTargetBarShape(element);
          const style = element.style;
          stopUnlabeledBarShapeAnimators(element);
          if (![s.x, s.y, s.width, s.height].every(Number.isFinite)) continue;
          const box: Box = [
            Math.min(s.x, s.x + s.width),
            Math.min(s.y, s.y + s.height),
            Math.abs(s.width),
            Math.abs(s.height),
          ];
          // Anchor entering/exiting segments to their own start edge so stacked upper
          // segments expand/collapse in place instead of crossing lower segments.
          const base: Box = horizontal ? [s.x, box[1], 0, box[3]] : [box[0], s.y, box[2], 0];
          const key = `${series.id}/${data.getId(i)}`;
          const previous = old.get(key);
          old.delete(key);

          const radii = Array.isArray(s.r) ? s.r : [s.r ?? 0];
          const radius: Radii = [
            radii[0] ?? 0,
            radii[1] ?? radii[0] ?? 0,
            radii[2] ?? radii[0] ?? 0,
            radii[3] ?? radii[1] ?? radii[0] ?? 0,
          ];
          const fill = validatePaint(style.fill);
          const stroke = validatePaint(style.stroke);
          const barParams = series.getDataParams(i);
          collected.push({
            key,
            from: previous?.from ?? base,
            to: box,
            base,
            clip,
            fill,
            stroke,
            opacity: style.opacity ?? 1,
            radius,
            border: stroke ? (style.lineWidth ?? 0) : 0,
            fromAlpha: previous?.fromAlpha ?? 0,
            toAlpha: 1,
            seriesIndex: barParams.seriesIndex ?? series.seriesIndex ?? 0,
            params: barParams,
            focusSeries,
            silent,
          });
          elements.push(element);
        }
      });
    } catch {
      fallback();
      return;
    }

    // Draw fading-out bars beneath active bars.
    const exiting: Bar[] = [];
    for (const bar of old.values()) exiting.push({ ...bar, to: bar.base, toAlpha: 0 });
    const allBars = exiting.length > 0 ? [...exiting, ...collected] : collected;
    // Group by grid clip rectangle with zero-allocation numeric comparison (stable sort keeps exiting under active).
    allBars.sort((a, b) => compareClip(a.clip, b.clip));
    bars = allBars;
    batches = [];
    for (let i = 0; i < bars.length; i++) {
      const clip = bars[i]!.clip;
      const last = batches.at(-1);
      if (last && sameClip(last.clip, clip)) last.end = i + 1;
      else batches.push({ clip, start: i, end: i + 1 });
    }

    for (const element of hidden.keys()) {
      if (!isGraphicAttached(element)) hidden.delete(element);
    }
    let needsFlush = false;
    for (const element of elements) {
      if (!hidden.has(element)) {
        hidden.set(element, { invisible: element.invisible, silent: element.silent });
      }
      if (setGraphicHidden(element, true, true)) needsFlush = true;
    }
    // Removed data can retain a fading host briefly; keep its bar paint hidden too.
    for (const element of hidden.keys()) {
      if (setGraphicHidden(element, true, true)) needsFlush = true;
    }

    // Keep grid lines (zlevel 0) below the bars and ECharts labels/marks (zlevel 1) above them.
    let labels = findZLevelCanvas(chart, 1);
    if (needsFlush || !labels) {
      refreshZRenderImmediately(chart);
      labels = findZLevelCanvas(chart, 1);
    }
    if (!labels) {
      fallback();
      return;
    }
    if (canvas.parentNode !== labels.parentNode || canvas.nextSibling !== labels) {
      labels.parentNode?.insertBefore(canvas, labels);
    }

    started = performance.now();
    duration =
      animate && next.animation !== false && !prefersReducedMotion()
        ? first
          ? typeof next.animationDuration === "number"
            ? next.animationDuration
            : 1000
          : typeof next.animationDurationUpdate === "number"
            ? next.animationDurationUpdate
            : CHART_UPDATE_DURATION
        : 0;
    loop.start(true);
  };

  const pickIndex = (event: MouseEvent): number => {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const t = clampedProgress(started, duration, performance.now());
    for (let i = bars.length - 1; i >= 0; i--) {
      const b = bars[i]!;
      if (b.silent || !b.toAlpha) continue;
      const [cx, cy, cw, ch] = b.clip;
      if (x < cx || x > cx + cw || y < cy || y > cy + ch) continue;
      const bx = interpolate(b.from[0], b.to[0], t);
      const by = interpolate(b.from[1], b.to[1], t);
      const bw = interpolate(b.from[2], b.to[2], t);
      const bh = interpolate(b.from[3], b.to[3], t);
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return i;
    }
    return -1;
  };

  const move = (event: MouseEvent) => {
    if (!active) return;
    const index = pickIndex(event);
    if (index === hoveredIndex) {
      if (index >= 0) setZRenderCursor(chart, "pointer");
      return;
    }
    clearHover();
    hoveredIndex = index;
    const bar = index >= 0 ? bars[index] : undefined;
    if (bar && option) {
      setZRenderCursor(chart, "pointer");
      chart.trigger("mouseover", params(bar, event));
      const settings = Array.isArray(option.tooltip) ? option.tooltip[0] : option.tooltip;
      if (settings?.show !== false && settings?.trigger !== "axis") {
        chart.dispatchAction({
          type: "showTip",
          seriesIndex: bar.seriesIndex,
          dataIndex: bar.params.dataIndex,
        });
        tipShown = true;
      }
    }
    loop.start(true);
  };

  const leave = () => {
    if (!active) return;
    clearHover();
    chart.dispatchAction({ type: "hideTip" });
    loop.start(true);
  };

  const click = (event: MouseEvent) => {
    if (!active) return;
    const index = pickIndex(event);
    if (index >= 0 && bars[index]) chart.trigger("click", params(bars[index]!, event));
  };

  const refresh = () => {
    if (active && option) update(option, false);
  };

  container.addEventListener("mousemove", move);
  container.addEventListener("mouseleave", leave);
  container.addEventListener("click", click);
  chart.on("datazoom", refresh);
  chart.on("legendselectchanged", refresh);

  return {
    isActive: () => active,
    deactivate,
    update,
    resize: refresh,
    pause: () => {
      paused = true;
      loop.stop();
      clearHover();
    },
    resume: () => {
      paused = false;
      if (active && option) loop.start(true);
    },
    dispose: () => {
      deactivate();
      chart.off("datazoom", refresh);
      chart.off("legendselectchanged", refresh);
      container.removeEventListener("mousemove", move);
      container.removeEventListener("mouseleave", leave);
      container.removeEventListener("click", click);
    },
  };
}
