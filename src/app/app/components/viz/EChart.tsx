import { CHART_UPDATE_DURATION, CHART_UPDATE_EASING } from "./chartMotion";
import { captureSankey, animateSankey } from "./sankeyTransitions";
import { createGpuScatter, gpuScatterOption } from "./gpuScatter";
import { createGpuBars, gpuBarOption, supportsGpuBars } from "./gpuBars";
import { memo, useEffect, useEffectEvent, useRef } from "react";
import * as echarts from "echarts/core";
import {
  PieChart,
  BarChart,
  LineChart,
  ScatterChart,
  TreemapChart,
  HeatmapChart,
  SankeyChart,
  CustomChart,
} from "echarts/charts";
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  MarkLineComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { LabelLayout } from "echarts/features";
import type { ComposeOption } from "echarts/core";
import type {
  PieSeriesOption,
  BarSeriesOption,
  LineSeriesOption,
  ScatterSeriesOption,
  TreemapSeriesOption,
  HeatmapSeriesOption,
  SankeySeriesOption,
  CustomSeriesOption,
} from "echarts/charts";
import type {
  TooltipComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TitleComponentOption,
  DataZoomComponentOption,
  DatasetComponentOption,
  GraphicComponentOption,
  VisualMapComponentOption,
} from "echarts/components";

// Register the required components and charts
echarts.use([
  PieChart,
  BarChart,
  LineChart,
  ScatterChart,
  TreemapChart,
  HeatmapChart,
  SankeyChart,
  CustomChart,
  TooltipComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  VisualMapComponent,
  CanvasRenderer,
  LabelLayout,
]);

// Compose option type from only the charts and components we use
export type EChartsOption = ComposeOption<
  | PieSeriesOption
  | BarSeriesOption
  | LineSeriesOption
  | ScatterSeriesOption
  | TreemapSeriesOption
  | HeatmapSeriesOption
  | SankeySeriesOption
  | CustomSeriesOption
  | TooltipComponentOption
  | GridComponentOption
  | LegendComponentOption
  | TitleComponentOption
  | DataZoomComponentOption
  | DatasetComponentOption
  | GraphicComponentOption
  | VisualMapComponentOption
>;

export interface EChartProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  onInit?: (chart: echarts.ECharts) => void;
  className?: string;
  /** Keep series identities for animated updates and retain chart zoom. */
  mergeUpdates?: boolean;
  /** Render a single circular scatterplot's points on the GPU. */
  gpuScatter?: boolean;
  /** Animate Cartesian bars on the GPU, retaining the ECharts layout and controls. */
  gpuBars?: boolean;
}

export const escapeEChartsHtml = (value: unknown) =>
  echarts.format.encodeHTML(value == null ? "" : String(value));

function datasetIdentity(source: unknown) {
  const first = Array.isArray(source) ? source[0] : undefined;
  return first && !Array.isArray(first) && typeof first === "object"
    ? "id" in first
      ? "id"
      : "name" in first
        ? "name"
        : "religion" in first
          ? "religion"
          : "scope" in first
            ? "scope"
            : undefined
    : undefined;
}

// ECharts diffs by series ID and item ID. Keep these stable while rankings change.
function animatedOption(option: EChartsOption, duration: number): EChartsOption {
  const list = <T,>(value: T | T[] | undefined): T[] =>
    value == null ? [] : Array.isArray(value) ? value : [value];
  const categoryAxis = [...list(option.xAxis), ...list(option.yAxis)].find(
    (axis) => axis.type === "category",
  );
  const labels = categoryAxis && "data" in categoryAxis ? categoryAxis.data : undefined;
  const datasets = list(option.dataset);
  return {
    ...option,
    animation:
      option.animation !== false && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    animationDurationUpdate: duration,
    animationEasingUpdate: CHART_UPDATE_EASING,
    dataset: datasets.map((dataset) => {
      const source = dataset.source;
      const identity = datasetIdentity(source);
      const dimensions = dataset.dimensions;
      return identity &&
        dimensions &&
        !dimensions.some((d) => (typeof d === "string" ? d === identity : d?.name === identity))
        ? { ...dataset, dimensions: [...dimensions, identity] }
        : dataset;
    }),
    series: list(option.series).map((series, index) => {
      const dataset = datasets[("datasetIndex" in series ? series.datasetIndex : 0) ?? 0];
      const source = dataset?.source;
      const identity = datasetIdentity(source);
      const data =
        "data" in series && Array.isArray(series.data)
          ? series.data.map((item, i) => {
              if (item && typeof item === "object" && !Array.isArray(item)) {
                const row = item as { id?: string | number; tag?: string; name?: string };
                return { ...item, id: row.id ?? row.tag ?? row.name ?? String(i) };
              }
              if (series.type === "bar" && labels?.[i] != null) {
                const label = labels[i];
                const name = typeof label === "object" ? label.value : label;
                return { value: item, name: String(name), id: String(name) };
              }
              return item;
            })
          : undefined;
      return {
        ...series,
        id: series.id ?? `transition/${series.type}/${series.name ?? index}`,
        ...(data ? { data } : {}),
        ...(identity
          ? { encode: { ...("encode" in series ? series.encode : {}), itemId: identity } }
          : {}),
        ...(series.type === "bar" ? { label: { ...series.label, valueAnimation: true } } : {}),
      };
    }),
  } as EChartsOption;
}

export const EChart = memo(function EChart({
  option,
  style,
  onInit,
  className,
  mergeUpdates = false,
  gpuScatter = false,
  gpuBars = false,
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const gpuRef = useRef<ReturnType<typeof createGpuScatter>>(undefined);
  const barsRef = useRef<ReturnType<typeof createGpuBars>>(undefined);
  const barsFailed = useRef(false);
  const onInitEvent = useEffectEvent((chart: echarts.ECharts) => {
    onInit?.(chart);
  });

  const visibleRef = useRef(!mergeUpdates);
  const appliedRef = useRef<EChartsOption | null>(null);
  const lastUpdateRef = useRef<{ option: EChartsOption; at: number } | null>(null);
  const applyOptionRef = useRef<(() => void) | undefined>(undefined);
  const applyOption = useEffectEvent(() => {
    const chart = chartRef.current;
    if (!chart || !visibleRef.current || appliedRef.current === option) return;
    const previousSankey = mergeUpdates ? captureSankey(chart) : undefined;
    const now = performance.now();
    // Finish frequent playback transitions before the next observation arrives.
    // Slower updates retain the usual duration; interrupted transitions still
    // start from their current position rather than jumping to the destination.
    const duration =
      lastUpdateRef.current == null
        ? CHART_UPDATE_DURATION
        : Math.min(CHART_UPDATE_DURATION, (now - lastUpdateRef.current.at) * 0.8);
    const next = mergeUpdates ? animatedOption(option, duration) : option;
    if (gpuBars && !barsFailed.current && !barsRef.current && supportsGpuBars(next)) {
      barsRef.current = createGpuBars(chart, () => {
        barsRef.current?.dispose();
        barsRef.current = undefined;
        barsFailed.current = true;
        appliedRef.current = null;
        applyOptionRef.current?.();
      });
      if (!barsRef.current) barsFailed.current = true;
    }
    if (barsRef.current && !supportsGpuBars(next)) {
      barsRef.current.dispose();
      barsRef.current = undefined;
    }
    barsRef.current?.restore();
    chart.setOption(
      gpuRef.current ? gpuScatterOption(next) : barsRef.current ? gpuBarOption(next) : next,
      {
        notMerge: !mergeUpdates,
        ...(mergeUpdates ? { replaceMerge: ["series"] } : {}),
      },
    );
    barsRef.current?.update(next);
    gpuRef.current?.update(next);
    appliedRef.current = option;
    if (lastUpdateRef.current?.option !== option) lastUpdateRef.current = { option, at: now };
    if (previousSankey) animateSankey(chart, previousSankey, duration);
  });

  useEffect(() => {
    applyOptionRef.current = applyOption;
    return () => {
      applyOptionRef.current = undefined;
    };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let rafId: number | undefined;
    let size = { width: 0, height: 0 };
    const resize = () => {
      const chart = chartRef.current;
      if (!chart || !visibleRef.current) return;
      const width = container.clientWidth,
        height = container.clientHeight;
      if (width === size.width && height === size.height) return;
      size = { width, height };
      chart.resize();
      gpuRef.current?.resize();
      barsRef.current?.resize();
    };
    const activate = () => {
      if (!chartRef.current) {
        // Dirty-rectangle painting clears strips of filled line series when
        // axis-pointer hover markers move. Repaint the canvas as a whole.
        const chart = echarts.init(container);
        chartRef.current = chart;
        if (gpuScatter) {
          gpuRef.current = createGpuScatter(chart, () => {
            gpuRef.current?.dispose();
            gpuRef.current = undefined;
            appliedRef.current = null;
            applyOption();
          });
        }
        if (mergeUpdates) {
          // Canvas text painting dominated the profile on a 180 Hz display.
          // Advance chart animations at at most 60 Hz, retaining their wall-clock duration.
          // Explicit synchronous updates (setOption/resize) must run immediately.
          const animation = chart.getZr().animation;
          const update = animation.update.bind(animation);
          let lastFrame = -Infinity;
          animation.update = (synchronous) => {
            const now = performance.now();
            if (!synchronous && now - lastFrame < 1000 / 60 - 0.5) return;
            lastFrame = now;
            update(synchronous);
          };
        }
        size = { width: container.clientWidth, height: container.clientHeight };
        onInitEvent(chart);
      } else {
        resize();
      }
      applyOption();
      chartRef.current?.getZr().animation.start();
      gpuRef.current?.resume();
      barsRef.current?.resume();
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChanged = () => {
      appliedRef.current = null;
      applyOption();
    };
    if (mergeUpdates) motion.addEventListener("change", motionChanged);
    // EU5 charts keep the latest option while clipped by a scroll panel or hidden.
    // They are created only when visible, then retained for subsequent animated updates.
    const visibility = mergeUpdates
      ? new IntersectionObserver(([entry]) => {
          visibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting) activate();
          else {
            chartRef.current?.getZr().animation.stop();
            gpuRef.current?.pause();
            barsRef.current?.pause();
          }
        })
      : null;
    visibleRef.current = !visibility;
    if (visibility) visibility.observe(container);
    else activate();
    const resizeObserver = new ResizeObserver(() => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(resize);
    });
    resizeObserver.observe(container);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      if (mergeUpdates) motion.removeEventListener("change", motionChanged);
      visibility?.disconnect();
      resizeObserver.disconnect();
      barsRef.current?.dispose();
      barsRef.current = undefined;
      barsFailed.current = false;
      gpuRef.current?.dispose();
      gpuRef.current = undefined;
      chartRef.current?.dispose();
      chartRef.current = null;
      appliedRef.current = null;
      lastUpdateRef.current = null;
    };
  }, [mergeUpdates, gpuScatter, gpuBars]);

  useEffect(() => {
    applyOption();
  }, [option, mergeUpdates]);

  return (
    <div
      className={className}
      ref={containerRef}
      style={style || { height: "400px", width: "100%" }}
    />
  );
});
