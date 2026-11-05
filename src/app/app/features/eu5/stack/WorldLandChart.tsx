import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartGutter,
  chartInk,
  chartTooltip,
  getEChartsTheme,
  selectionColor,
} from "@/components/viz/echartsTheme";
import { formatInt, formatTick } from "@/lib/format";
import type { LandPoint } from "@/wasm/wasm_eu5";
import { SectionTitle } from "../components";
import { useEu5TimelineLive, useEu5TimelineMapDate } from "../store";
import { useChartExport } from "./chartExport";

export type WorldLandLine = { name: string; color: string; key: number; points: LandPoint[] };

/**
 * How the great powers and the save's own country grew, from the ownership history of
 * the save. Each line has its game colour and its name at the end, and the map's
 * date stands on the chart when the timeline has moved.
 */
export function WorldLandChart({ lines, homeKey }: { lines: WorldLandLine[]; homeKey?: number }) {
  const live = useEu5TimelineLive();
  const date = useEu5TimelineMapDate();
  const year = live ? null : date.year;
  const title = "Land of the great powers by year";
  const chartImage = useChartExport(title);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    return {
      animation: false,
      grid: { ...chartGutter, left: 40, top: 10, bottom: 22, right: 136 },
      xAxis: {
        type: "value",
        min: "dataMin",
        max: "dataMax",
        axisLabel: {
          color: tickColor,
          fontSize: 12,
          formatter: (v: number) => String(v),
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { color: tickColor, fontSize: 12, formatter: (v: number) => formatTick(v) },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const value = params.value as [number, number];
          return `<strong>${escapeEChartsHtml(String(params.seriesName))}</strong><br/>${value[0]}: ${formatInt(value[1])} locations`;
        },
      },
      series: lines.map((line, i) => {
        // The chart says one thing: who holds the most land, and where the reader is.
        const end = line.points.at(-1)?.locations ?? 0;
        const most = Math.max(...lines.map((other) => other.points.at(-1)?.locations ?? 0));
        const strong = line.key === homeKey || end === most;
        return {
          type: "line" as const,
          name: line.name,
          symbol: "none",
          triggerLineEvent: true,
          data: line.points.map((p) => [p.year, p.locations]),
          lineStyle: {
            color: strong ? line.color : chartInk.muted,
            width: line.key === homeKey ? 2.5 : strong ? 2 : 1,
            opacity: strong ? 1 : 0.55,
          },
          emphasis: {
            focus: "series" as const,
            lineStyle: { color: line.color, width: 2.5, opacity: 1 },
          },
          z: strong ? 3 : 2,
          endLabel: {
            show: true,
            // The swatch has the country's colour, as the map has it.
            formatter: `{mark|\u25a0} {name|${line.name}} {value|${formatInt(end)}}`,
            distance: 6,
            rich: {
              mark: { color: line.color, fontSize: 11 },
              name: { color: strong ? chartInk.primary : chartInk.secondary, fontSize: 12 },
              value: {
                color: strong ? chartInk.primary : chartInk.secondary,
                fontSize: 12,
                fontWeight: strong ? 600 : 400,
              },
            },
          },
          labelLayout: { moveOverlap: "shiftY" as const },
          markLine:
            i === 0 && year !== null
              ? {
                  silent: true,
                  symbol: "none",
                  animation: false,
                  data: [{ xAxis: year }],
                  lineStyle: { color: selectionColor, width: 1.5, type: "solid" as const },
                  label: { formatter: String(year), color: chartInk.primary, fontSize: 12 },
                }
              : undefined,
        };
      }),
    };
  }, [lines, homeKey, year]);

  return (
    <section className="border-t border-game-line px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{title}</SectionTitle>
        {chartImage.button}
      </div>
      <EChart
        option={option}
        style={{ height: "210px", width: "100%" }}
        onInit={chartImage.track}
      />
    </section>
  );
}
