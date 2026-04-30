import { useEffect, useMemo, useRef, memo } from "react";
import * as echarts from "echarts/core";
import {
  PieChart,
  BarChart,
  LineChart,
  ScatterChart,
  TreemapChart,
  HeatmapChart,
  SankeyChart,
} from "echarts/charts";
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";
import type {
  PieSeriesOption,
  BarSeriesOption,
  LineSeriesOption,
  ScatterSeriesOption,
  TreemapSeriesOption,
  HeatmapSeriesOption,
  SankeySeriesOption,
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
import { useIsDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "./echartsTheme";

// Register the required components and charts
echarts.use([
  PieChart,
  BarChart,
  LineChart,
  ScatterChart,
  TreemapChart,
  HeatmapChart,
  SankeyChart,
  TooltipComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  CanvasRenderer,
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
}

export const escapeEChartsHtml = (value: unknown) =>
  echarts.format.encodeHTML(value == null ? "" : String(value));

export const EChart = memo(function EChart({ option, style, onInit, className }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onInitRef = useRef(onInit);
  const isDark = useIsDarkMode();
  const themedOption = useMemo(() => applyEChartsTheme(option, isDark), [option, isDark]);
  onInitRef.current = onInit;

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    onInitRef.current?.(chart);

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

    chart.setOption(themedOption, { notMerge: true });
  }, [themedOption]);

  return (
    <div
      className={className}
      ref={containerRef}
      style={style || { height: "400px", width: "100%" }}
    />
  );
});

function applyEChartsTheme(option: EChartsOption, isDark: boolean): EChartsOption {
  const theme = getEChartsTheme(isDark);
  const current = option as Record<string, unknown>;
  const tooltip =
    typeof current.tooltip === "object" &&
    current.tooltip !== null &&
    !Array.isArray(current.tooltip)
      ? (current.tooltip as Record<string, unknown>)
      : {};
  const textStyle =
    typeof current.textStyle === "object" && current.textStyle !== null
      ? (current.textStyle as Record<string, unknown>)
      : {};

  return {
    ...option,
    backgroundColor: current.backgroundColor ?? theme.backgroundColor,
    textStyle: {
      color: theme.labelColor,
      ...textStyle,
    },
    tooltip: {
      backgroundColor: theme.tooltipBackgroundColor,
      borderColor: theme.tooltipBorderColor,
      textStyle: { color: theme.tooltipTextColor },
      ...tooltip,
    },
  } as EChartsOption;
}
