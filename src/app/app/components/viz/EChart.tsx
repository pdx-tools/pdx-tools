import { useEffect, useRef, memo } from "react";
import * as echarts from "echarts/core";
import { PieChart, BarChart, LineChart, ScatterChart, TreemapChart } from "echarts/charts";
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";
import type {
  PieSeriesOption,
  BarSeriesOption,
  LineSeriesOption,
  ScatterSeriesOption,
  TreemapSeriesOption,
} from "echarts/charts";
import type {
  TooltipComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TitleComponentOption,
  DataZoomComponentOption,
  DatasetComponentOption,
  GraphicComponentOption,
} from "echarts/components";

// Register the required components and charts
echarts.use([
  PieChart,
  BarChart,
  LineChart,
  ScatterChart,
  TreemapChart,
  TooltipComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

// Compose option type from only the charts and components we use
export type EChartsOption = ComposeOption<
  | PieSeriesOption
  | BarSeriesOption
  | LineSeriesOption
  | ScatterSeriesOption
  | TreemapSeriesOption
  | TooltipComponentOption
  | GridComponentOption
  | LegendComponentOption
  | TitleComponentOption
  | DataZoomComponentOption
  | DatasetComponentOption
  | GraphicComponentOption
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

    chart.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      className={className}
      ref={containerRef}
      style={style || { height: "400px", width: "100%" }}
    />
  );
});
