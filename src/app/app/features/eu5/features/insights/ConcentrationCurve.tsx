import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { chartTooltip, getEChartsTheme, seriesColor } from "@/components/viz/echartsTheme";
import type { ConcentrationPoint } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";

function formatPercent(value: number, digits = 1) {
  return `${formatFloat(value * 100, digits)}%`;
}

const DEFAULT_FORMAT_VALUE = (value: number) => formatInt(Math.round(value));

/**
 * How much of a scope's total the top N locations hold. The steeper the
 * rise, the more the metric sits in a few places.
 */
export function ConcentrationCurve({
  points,
  metric,
  formatValue = DEFAULT_FORMAT_VALUE,
}: {
  points: ConcentrationPoint[];
  /** The metric's name in the tooltip, such as "population" or "wealth". */
  metric: string;
  formatValue?: (value: number) => string;
}) {
  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      grid: {
        left: 48,
        right: 18,
        top: 10,
        bottom: 36,
        outerBounds: { left: 0, right: 0, top: 0, bottom: 0 },
        outerBoundsContain: "axisLabel",
      },
      xAxis: {
        type: "value",
        name: "Locations",
        min: 1,
        max: points.at(-1)?.locationRank ?? 1,
        nameTextStyle: { color: tickColor, fontSize: 10 },
        axisLabel: { color: tickColor, fontSize: 10 },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.4, width: 1 } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (value: number) => formatPercent(value, 0),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = (arr[0] as { dataIndex?: number } | undefined)?.dataIndex;
          if (idx == null) return "";
          const point = points[idx];
          if (!point) return "";
          return [
            `<strong>Top ${formatInt(point.locationRank)} locations</strong>`,
            `Account for <strong>${formatPercent(point.share)}</strong> of total ${metric}`,
            `Total: ${formatValue(point.cumulativeValue)}`,
            `Location ${metric}: ${formatValue(point.value)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "line",
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.16 },
          lineStyle: { width: 2, color: seriesColor(0) },
          itemStyle: { color: seriesColor(0) },
          data: points.map((point) => [point.locationRank, point.share]),
        },
      ],
    };
  }, [points, metric, formatValue]);

  return <EChart option={option} style={{ height: "260px", width: "100%" }} />;
}
