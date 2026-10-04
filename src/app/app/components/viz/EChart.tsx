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
    animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
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

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    onInitEvent(chart);

    let rafId: ReturnType<typeof requestAnimationFrame> | undefined;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        chart.resize();
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const previousSankey = mergeUpdates ? captureSankey(chart) : undefined;
    chart.setOption(mergeUpdates ? animatedOption(option) : option, {
      notMerge: !mergeUpdates,
      ...(mergeUpdates ? { replaceMerge: ["series"] } : {}),
    });
    if (previousSankey) animateSankey(chart, previousSankey);
  }, [option, mergeUpdates]);

  return (
    <div
      className={className}
      ref={containerRef}
      style={style || { height: "400px", width: "100%" }}
    />
  );
});
