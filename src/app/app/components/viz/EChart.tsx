import { captureSankey, animateSankey } from "./sankeyTransitions";
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
}

export const escapeEChartsHtml = (value: unknown) =>
  echarts.format.encodeHTML(value == null ? "" : String(value));

// ECharts diffs by series ID and item ID. Keep these stable while rankings change.
function animatedOption(option: EChartsOption): EChartsOption {
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
    animationDurationUpdate: 800,
    animationEasingUpdate: "cubicInOut",
    dataset: datasets.map((dataset) => {
      const source = dataset.source;
      const first = Array.isArray(source) ? source[0] : undefined;
      const identity =
        first && !Array.isArray(first) && typeof first === "object"
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
      const first = Array.isArray(source) ? source[0] : undefined;
      const identity =
        first && !Array.isArray(first) && typeof first === "object"
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
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onInitEvent = useEffectEvent((chart: echarts.ECharts) => {
    onInit?.(chart);
  });

  const visibleRef = useRef(!mergeUpdates);
  const appliedRef = useRef<EChartsOption | null>(null);
  const applyOption = useEffectEvent(() => {
    const chart = chartRef.current;
    if (!chart || !visibleRef.current || appliedRef.current === option) return;
    const previousSankey = mergeUpdates ? captureSankey(chart) : undefined;
    chart.setOption(mergeUpdates ? animatedOption(option) : option, {
      notMerge: !mergeUpdates,
      ...(mergeUpdates ? { replaceMerge: ["series"] } : {}),
    });
    appliedRef.current = option;
    if (previousSankey) animateSankey(chart, previousSankey);
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
    };
    const activate = () => {
      if (!chartRef.current) {
        const chart = echarts.init(container, undefined, { useDirtyRect: mergeUpdates });
        chartRef.current = chart;
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
        chartRef.current.getZr().animation.start();
        resize();
      }
      applyOption();
    };
    // EU5 charts keep the latest option while clipped by a scroll panel or hidden.
    // They are created only when visible, then retained for subsequent animated updates.
    const visibility = mergeUpdates
      ? new IntersectionObserver(([entry]) => {
          visibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting) activate();
          else chartRef.current?.getZr().animation.stop();
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
      visibility?.disconnect();
      resizeObserver.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
      appliedRef.current = null;
    };
  }, [mergeUpdates]);

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
