import { useEffectEvent, useMemo } from "react";
import type * as echarts from "echarts/core";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { dateFromDayNumber, dayNumber, formatLongDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";

/** One dot: the value of a series in the snapshot of one campaign save. */
export type BySavePoint = { saveKey: string; day: number; value: number };

export type BySaveSeries = {
  key: string;
  label: string;
  color: string;
  points: BySavePoint[];
};

/** A save without a dot of its own, such as one that failed. */
export type AxisMark = { key: string; day: number; reason: string };

export type BySaveChartProps = {
  series: BySaveSeries[];
  marks: AxisMark[];
  /** The first and last save date of the campaign. */
  range: [DateComponents, DateComponents];
  axisName: string;
  /** The hover text of a dot. */
  describe: (series: BySaveSeries, point: BySavePoint) => string[];
  /** Name each series beside its last dot. */
  endLabels: boolean;
  /** The day of the selected save, drawn as a rule through the plot. */
  selectedDay: number | null;
  /** The day of the open save, when it has dots. */
  openDay: number | null;
  /** Select the save of a dot or an axis mark. */
  onSelect: (saveKey: string) => void;
};

export function BySaveChart({
  series,
  marks,
  range,
  axisName,
  describe,
  endLabels,
  selectedDay,
  openDay,
  onSelect,
}: BySaveChartProps) {
  const dark = isDarkMode();
  const option = useMemo((): EChartsOption => {
    const [first, last] = range.map(dayNumber);
    const pad = Math.max(30, Math.round((last - first) * 0.02));
    const ink = dark ? "#cbd5e1" : "#334155";
    return {
      animation: false,
      grid: { left: 64, right: endLabels ? 96 : 24, top: 24, bottom: series.length > 1 ? 72 : 48 },
      legend: {
        show: series.length > 1,
        type: "scroll",
        bottom: 0,
        data: series.map((entry) => entry.label),
        textStyle: { color: ink },
        pageTextStyle: { color: ink },
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params;
          const data = item.data as { lines: string[] };
          return data.lines.map(escapeEChartsHtml).join("<br/>");
        },
      },
      xAxis: {
        type: "value",
        min: first - pad,
        max: last + pad,
        axisLabel: {
          color: ink,
          formatter: (value: number) => String(dateFromDayNumber(value).year),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        name: axisName,
        nameLocation: "middle",
        nameGap: 48,
        nameTextStyle: { color: ink },
        axisLabel: { color: ink },
      },
      series: [
        ...series.map((entry) => ({
          type: "scatter" as const,
          name: entry.label,
          symbolSize: 8,
          itemStyle: {
            color: entry.color,
            borderColor: needsOutline(entry.color) ? ink : undefined,
            borderWidth: needsOutline(entry.color) ? 1 : 0,
          },
          data: entry.points.map((point, i) => ({
            value: [point.day, point.value],
            saveKey: point.saveKey,
            lines: describe(entry, point),
            label:
              endLabels && i === entry.points.length - 1
                ? { show: true, position: "right" as const, formatter: entry.key, color: ink }
                : undefined,
          })),
        })),
        {
          type: "scatter" as const,
          name: "Saves without a value",
          symbol: "triangle",
          symbolSize: 7,
          itemStyle: { color: "transparent", borderColor: ink, borderWidth: 1 },
          data: marks.map((mark) => ({
            value: [mark.day, 0],
            saveKey: mark.key,
            lines: [formatLongDate(dateFromDayNumber(mark.day)), mark.reason],
          })),
          markLine: {
            silent: true,
            symbol: ["none", "none"],
            animation: false,
            data: [
              ...(selectedDay === null
                ? []
                : [
                    {
                      xAxis: selectedDay,
                      lineStyle: { color: ink, type: "solid" as const, width: 1 },
                      label: {
                        formatter: "Selected",
                        position: "insideEndTop" as const,
                        color: ink,
                      },
                    },
                  ]),
              ...(openDay === null
                ? []
                : [
                    {
                      xAxis: openDay,
                      lineStyle: { color: ink, type: "dashed" as const, width: 2 },
                      label: { formatter: "Open now", position: "end" as const, color: ink },
                    },
                  ]),
            ],
          },
        },
      ],
    };
  }, [series, marks, range, axisName, describe, endLabels, selectedDay, openDay, dark]);
  const onInit = useEffectEvent((chart: echarts.ECharts) => {
    const onClick = (params: { data?: unknown }) => {
      const key = (params.data as { saveKey?: string } | undefined)?.saveKey;
      if (key) onSelect(key);
    };
    chart.on("click", onClick);
    return () => chart.off("click", onClick);
  });
  return (
    <EChart
      option={option}
      onInit={(chart) => onInit(chart)}
      style={{ height: "360px", width: "100%" }}
    />
  );
}

/** Near black and near white game colors get a neutral outline. */
function needsOutline(color: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return false;
  const [r, g, b] = match.slice(1).map((hex) => parseInt(hex, 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.08 || luminance > 0.92;
}
