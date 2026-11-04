import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartGutter,
  chartInk,
  chartNumberText,
  chartTooltip,
  getEChartsTheme,
  neutralMark,
  yAxisName,
} from "@/components/viz/echartsTheme";
import type { ConcentrationPoint } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt, formatPercent as formatShare } from "@/lib/format";

function formatPercent(value: number, digits = 1) {
  return `${formatFloat(value * 100, digits)}%`;
}

const DEFAULT_FORMAT_VALUE = (value: number) => formatInt(Math.round(value));

/** The part of the locations that the reading above the curve names */
const TOP_PART = 0.1;

/**
 * The main figure of a curve: how much the top tenth of the locations holds. A
 * short list has its top location, so that the reading stays true.
 */
export function concentrationReading(points: readonly ConcentrationPoint[]) {
  const rank = Math.max(1, Math.round(points.length * TOP_PART));
  const point = points[rank - 1];
  return point ? { rank, count: points.length, share: point.share } : null;
}

/**
 * How much of a scope's total the top N locations hold. The steeper the
 * rise, the more the metric sits in a few places.
 */
export function ConcentrationCurve({
  points,
  metric,
  formatValue = DEFAULT_FORMAT_VALUE,
  showReading = true,
}: {
  points: ConcentrationPoint[];
  /** The metric's name in the tooltip, such as "population" or "wealth". */
  metric: string;
  formatValue?: (value: number) => string;
  /** The line above the curve. A level whose finding quotes the same figure has no line. */
  showReading?: boolean;
}) {
  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    const quoted = concentrationReading(points);

    return {
      grid: { ...chartGutter, top: 28, bottom: 40 },
      xAxis: {
        type: "value",
        // The name sits under the axis. At the axis end, the grid clips it.
        name: "Locations",
        nameLocation: "middle",
        nameGap: 24,
        min: 1,
        max: points.at(-1)?.locationRank ?? 1,
        nameTextStyle: { color: tickColor, fontSize: 12 },
        axisLabel: { color: tickColor, fontSize: 12, hideOverlap: true },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.4, width: 1 } },
      },
      yAxis: {
        type: "value",
        ...yAxisName(`Share of ${metric}`),
        min: 0,
        max: 1,
        axisLabel: {
          color: tickColor,
          fontSize: 12,
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
          lineStyle: { width: 2, color: neutralMark },
          itemStyle: { color: neutralMark },
          data: points.map((point) => [point.locationRank, point.share]),
        },
        // The point that the reading quotes: the top tenth of the locations.
        ...(quoted
          ? [
              {
                type: "scatter" as const,
                silent: true,
                symbolSize: 8,
                itemStyle: {
                  color: chartInk.primary,
                  borderColor: chartInk.surface,
                  borderWidth: 1,
                },
                label: {
                  ...chartNumberText,
                  show: true,
                  position: "right" as const,
                  color: chartInk.primary,
                  formatter: formatShare(quoted.share),
                },
                data: [[quoted.rank, quoted.share]],
                tooltip: { show: false },
              },
            ]
          : []),
      ],
    };
  }, [points, metric, formatValue]);

  const reading = concentrationReading(points);
  return (
    <>
      {reading && showReading ? (
        <p className="mb-1 text-xs text-game-ink-300">
          Top <span className="font-game-num tabular-nums">{formatInt(reading.rank)}</span> of{" "}
          <span className="font-game-num tabular-nums">{formatInt(reading.count)}</span> locations
          hold{" "}
          <span className="font-game-num text-game-ink-100 tabular-nums">
            {formatShare(reading.share)}
          </span>{" "}
          of {metric}
        </p>
      ) : null}
      <EChart option={option} style={{ height: "240px", width: "100%" }} />
    </>
  );
}
