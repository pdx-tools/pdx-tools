import {
  CHART_UPDATE_EASING,
  adaptiveDuration,
  prefersReducedMotion,
  subscribeReducedMotion,
} from "./chartMotion";
import { setZRenderAnimationRunning, throttleZRenderAnimation } from "./echartsInternals";
import { captureSankey, animateSankey } from "./sankeyTransitions";
import { createGpuScatter, gpuScatterOption } from "./gpuScatter";
import { barOverlayOption, createBarOverlay, supportsBarOverlay } from "./barOverlay";
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
import { useGameTheme } from "@/components/GameThemeProvider";
import { chartTheme } from "./echartsTheme";
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
  /** The option, or a function that makes it from the chart, for an option that reads the chart */
  option: EChartsOption | ((chart: echarts.ECharts) => EChartsOption);
  style?: React.CSSProperties;
  /** Called for each new chart. A function that it gives back runs before the chart goes. */
  onInit?: (chart: echarts.ECharts) => void | (() => void);
  className?: string;
  /** Keep series identities for animated updates and retain chart zoom. */
  mergeUpdates?: boolean;
  /** Render a single circular scatterplot's points on the GPU. */
  gpuScatter?: boolean;
  /** Animate Cartesian bars on a lightweight 2D Canvas overlay, keeping axes/gridlines static. */
  barOverlay?: boolean;
}

export const escapeEChartsHtml = (value: unknown) =>
  echarts.format.encodeHTML(value == null ? "" : String(value));

const isKeyValue = (value: unknown): value is string | number =>
  typeof value === "string" || typeof value === "number";

/**
 * Derive a stable item identity dimension for object-array datasets:
 * prefer canonical `id` or `name`, otherwise fall back to the first declared
 * category dimension (ECharts' convention for category-axis datasets).
 */
function datasetIdentity(dataset: DatasetComponentOption | undefined): string | undefined {
  const source = dataset?.source;
  const first = Array.isArray(source) ? source[0] : undefined;
  if (!first || Array.isArray(first) || typeof first !== "object") return undefined;
  const record = first as Record<string, unknown>;
  if ("id" in record && isKeyValue(record.id)) return "id";
  if ("name" in record && isKeyValue(record.name)) return "name";
  const firstDim = dataset?.dimensions?.[0];
  const dimName = typeof firstDim === "string" ? firstDim : firstDim?.name;
  if (dimName && dimName in record && isKeyValue(record[dimName])) return dimName;
  return undefined;
}

// ECharts diffs by series ID and item ID. Keep these stable while rankings change.
export function animatedOption(option: EChartsOption, duration: number): EChartsOption {
  const list = <T,>(value: T | T[] | undefined): T[] =>
    value == null ? [] : Array.isArray(value) ? value : [value];
  const categoryAxis = [...list(option.xAxis), ...list(option.yAxis)].find(
    (axis) => axis.type === "category",
  );
  const labels = categoryAxis && "data" in categoryAxis ? categoryAxis.data : undefined;
  const datasets = list(option.dataset);
  return {
    ...option,
    animation: option.animation !== false && !prefersReducedMotion(),
    animationDurationUpdate: duration,
    animationEasingUpdate: CHART_UPDATE_EASING,
    dataset: datasets.map((dataset) => {
      const identity = datasetIdentity(dataset);
      const dimensions = dataset.dimensions;
      return identity &&
        dimensions &&
        !dimensions.some((d) => (typeof d === "string" ? d === identity : d?.name === identity))
        ? { ...dataset, dimensions: [...dimensions, identity] }
        : dataset;
    }),
    series: list(option.series).map((series, index) => {
      const hasInlineData = "data" in series && Array.isArray(series.data);
      const dataset = hasInlineData
        ? undefined
        : datasets[("datasetIndex" in series ? series.datasetIndex : 0) ?? 0];
      const identity = datasetIdentity(dataset);
      const data = hasInlineData
        ? (series.data as unknown[]).map((item, i) => {
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
  barOverlay = false,
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const gpuRef = useRef<ReturnType<typeof createGpuScatter>>(undefined);
  const barsRef = useRef<ReturnType<typeof createBarOverlay>>(undefined);
  const theme = chartTheme(useGameTheme()?.theme);
  const onInitEvent = useEffectEvent((chart: echarts.ECharts) => onInit?.(chart));

  const visibleRef = useRef(!mergeUpdates);
  const resetOptionRef = useRef(false);
  const appliedRef = useRef<EChartProps["option"] | null>(null);
  const lastUpdateRef = useRef<{ option: EChartProps["option"]; at: number } | null>(null);

  // Overlays are mutually exclusive; gpuScatter takes precedence if both are ever set.
  const useBarOverlayProp = barOverlay && !gpuScatter;

  const applyOption = useEffectEvent(() => {
    const chart = chartRef.current;
    if (!chart || !visibleRef.current || appliedRef.current === option) return;
    const previousSankey = mergeUpdates ? captureSankey(chart) : undefined;
    const now = performance.now();
    const duration = adaptiveDuration(lastUpdateRef.current?.at ?? null, now);
    const resolved = typeof option === "function" ? option(chart) : option;
    const next = mergeUpdates ? animatedOption(resolved, duration) : resolved;

    const useBars = Boolean(barsRef.current && supportsBarOverlay(next));
    if (barsRef.current && !useBars && barsRef.current.isActive()) {
      barsRef.current.deactivate();
      resetOptionRef.current = true;
    }

    const merge = mergeUpdates && !resetOptionRef.current;
    // Always replace series, axes, and legend so conditional components never linger;
    // only replace dataZoom when omitted so persistent sliders retain user zoom state.
    const replaceMerge =
      next.dataZoom == null
        ? ["series", "xAxis", "yAxis", "legend", "dataZoom"]
        : ["series", "xAxis", "yAxis", "legend"];
    chart.setOption(
      gpuRef.current ? gpuScatterOption(next) : useBars ? barOverlayOption(next) : next,
      {
        notMerge: !merge,
        ...(merge ? { replaceMerge } : {}),
      },
    );
    resetOptionRef.current = false;
    if (useBars) barsRef.current?.update(next);
    gpuRef.current?.update(next);
    appliedRef.current = option;
    if (lastUpdateRef.current?.option !== option) lastUpdateRef.current = { option, at: now };
    if (previousSankey && next.animation !== false && duration > 0) {
      animateSankey(chart, previousSankey, duration);
    }
  });

  const hasPendingOption = useEffectEvent(() => appliedRef.current !== option);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let rafId: number | undefined;
    let cleanup: void | (() => void);
    let size = { width: 0, height: 0 };
    const resize = (syncOverlays = true) => {
      const chart = chartRef.current;
      if (!chart || !visibleRef.current) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0 || (width === size.width && height === size.height)) return;
      size = { width, height };
      chart.resize();
      if (syncOverlays) {
        gpuRef.current?.resize();
        barsRef.current?.resize();
      }
    };
    const activate = () => {
      if (!chartRef.current) {
        // Dirty-rectangle painting clears strips of filled line series when
        // axis-pointer hover markers move. Repaint the canvas as a whole.
        const chart = echarts.init(container, theme);
        chartRef.current = chart;
        if (gpuScatter) {
          gpuRef.current = createGpuScatter(chart, () => {
            gpuRef.current?.dispose();
            gpuRef.current = undefined;
            // The hidden Canvas series still has WebGL-specific options.
            resetOptionRef.current = true;
            appliedRef.current = null;
            applyOption();
          });
        }
        if (useBarOverlayProp) {
          barsRef.current = createBarOverlay(chart, () => {
            barsRef.current?.dispose();
            barsRef.current = undefined;
            resetOptionRef.current = true;
            appliedRef.current = null;
            applyOption();
          });
        }
        if (mergeUpdates) throttleZRenderAnimation(chart);
        size = { width: container.clientWidth, height: container.clientHeight };
        cleanup = onInitEvent(chart);
      } else {
        // If a new option is pending, only resize ECharts here so overlays rebuild once in applyOption.
        resize(!hasPendingOption());
      }
      setZRenderAnimationRunning(chartRef.current, true);
      gpuRef.current?.resume();
      barsRef.current?.resume();
      applyOption();
    };
    const unsubscribeMotion = mergeUpdates
      ? subscribeReducedMotion(() => {
          appliedRef.current = null;
          applyOption();
        })
      : undefined;
    // EU5 charts keep the latest option while clipped by a scroll panel or hidden.
    // They are created only when visible, then retained for subsequent animated updates.
    const visibility =
      mergeUpdates && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            const entry = entries.at(-1);
            if (!entry) return;
            visibleRef.current = entry.isIntersecting;
            if (entry.isIntersecting) activate();
            else {
              if (chartRef.current) setZRenderAnimationRunning(chartRef.current, false);
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
      rafId = requestAnimationFrame(() => resize(true));
    });
    resizeObserver.observe(container);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      unsubscribeMotion?.();
      visibility?.disconnect();
      resizeObserver.disconnect();
      barsRef.current?.dispose();
      barsRef.current = undefined;
      gpuRef.current?.dispose();
      gpuRef.current = undefined;
      cleanup?.();
      chartRef.current?.dispose();
      chartRef.current = null;
      resetOptionRef.current = false;
      appliedRef.current = null;
      lastUpdateRef.current = null;
    };
  }, [mergeUpdates, gpuScatter, useBarOverlayProp, theme]);

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
