import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartInk,
  chartTooltip,
  neutralFill,
  neutralMark,
  yAxisName,
} from "@/components/viz/echartsTheme";
import type { ConcentrationPoint } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { formatPercent, formatPercentTick } from "../../numberFormatting";
import { Figure } from "../../components/Figure";

const DEFAULT_FORMAT_VALUE = (value: number) => formatInt(Math.round(value));

/** The part of the locations that the reading over the curve names */
const TOP_PART = 0.1;

/**
 * The main figure of a curve: how much the top tenth of the locations holds.
 * A list of fewer than ten has its top location, so the reading stays true.
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
}: {
  points: ConcentrationPoint[];
  /** The metric's name in the tooltip, such as "population" or "wealth". */
  metric: string;
  formatValue?: (value: number) => string;
}) {
  const reading = concentrationReading(points);

  const option = useMemo((): EChartsOption => {
    const quoted = concentrationReading(points);
    return {
      grid: {
        left: 48,
        right: 18,
        top: 28,
        bottom: 48,
        outerBounds: { left: 0, right: 0, top: 0, bottom: 0 },
        outerBoundsContain: "axisLabel",
      },
      xAxis: {
        type: "value",
        name: "Locations, largest first",
        nameLocation: "middle",
        nameGap: 28,
        min: 1,
        max: points.at(-1)?.locationRank ?? 1,
      },
      yAxis: {
        type: "value",
        ...yAxisName(`Share of ${metric}`),
        min: 0,
        max: 1,
        axisLabel: { formatter: formatPercentTick },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = arr.find((p) => p.seriesIndex === 0)?.dataIndex;
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
          // Straight lines between the points: a curve between them can go
          // over the true share.
          type: "line",
          showSymbol: false,
          areaStyle: { color: neutralFill },
          lineStyle: { width: 2, color: neutralMark },
          itemStyle: { color: neutralMark },
          data: points.map((point) => [point.locationRank, point.share]),
        },
        // The point that the reading names.
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
                data: [[quoted.rank, quoted.share]],
                tooltip: { show: false },
              },
            ]
          : []),
      ],
    };
  }, [points, metric, formatValue]);

  return (
    <>
      {reading && (
        <p className="mb-1 text-xs text-game-ink-300">
          {reading.rank === 1
            ? `The largest of ${formatInt(reading.count)} locations holds `
            : `The top ${formatInt(reading.rank)} of ${formatInt(reading.count)} locations hold `}
          <span className="font-game-num text-game-ink-100 tabular-nums">
            <Figure value={reading.share} form="percent" />
          </span>{" "}
          of the {metric}
        </p>
      )}
      <EChart option={option} style={{ height: "260px", width: "100%" }} />
    </>
  );
}
