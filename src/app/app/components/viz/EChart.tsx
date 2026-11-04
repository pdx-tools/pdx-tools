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
import { formatTick } from "@/lib/format";
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
}

export const escapeEChartsHtml = (value: unknown) =>
  echarts.format.encodeHTML(value == null ? "" : String(value));

/**
 * The theme of a chart from the surface that holds it. A canvas does not
 * inherit a font, so a surface sets `--game-chart-font` for names and
 * `--game-chart-num-font` for numbers, and the text of the chart uses them. A
 * value axis gets the numbers' font and the compact tick form. An option can
 * replace each part. Other surfaces, such as EU4, do not set the tokens and
 * keep the default of ECharts.
 */
function chartTheme(el: HTMLElement): object | undefined {
  const styles = getComputedStyle(el);
  const fontFamily = styles.getPropertyValue("--game-chart-font").trim();
  if (!fontFamily) return undefined;
  const numbers = {
    axisLabel: {
      fontFamily: styles.getPropertyValue("--game-chart-num-font").trim(),
      formatter: (value: number) => formatTick(value),
    },
  };
  return {
    textStyle: { fontFamily, fontSize: 12, fontWeight: 400 },
    valueAxis: numbers,
    logAxis: numbers,
  };
}

export const EChart = memo(function EChart({ option, style, onInit, className }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onInitEvent = useEffectEvent((chart: echarts.ECharts) => {
    onInit?.(chart);
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, chartTheme(containerRef.current));
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
