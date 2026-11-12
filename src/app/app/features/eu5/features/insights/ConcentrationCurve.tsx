import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { chartTooltip, neutralFill, neutralMark } from "@/components/viz/echartsTheme";
import type { ConcentrationPoint } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { formatPercent, formatPercentTick } from "../../numberFormatting";

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
    return {
      grid: {
        left: 48,
        right: 18,
        top: 10,
        bottom: 48,
        outerBounds: { left: 0, right: 0, top: 0, bottom: 0 },
        outerBoundsContain: "axisLabel",
      },
      xAxis: {
        type: "value",
        name: "Locations",
        nameLocation: "middle",
        nameGap: 28,
        min: 1,
        max: points.at(-1)?.locationRank ?? 1,
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: { formatter: formatPercentTick },
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
          areaStyle: { color: neutralFill },
          lineStyle: { width: 2, color: neutralMark },
          itemStyle: { color: neutralMark },
          data: points.map((point) => [point.locationRank, point.share]),
        },
      ],
    };
  }, [points, metric, formatValue]);

  return <EChart option={option} style={{ height: "260px", width: "100%" }} />;
}
