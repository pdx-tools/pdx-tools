import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { dateFromDayNumber, dayNumber, formatLongDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";

/** One dot: the value of a series in one snapshot. */
export type BySavePoint = { snapshotId: string; day: number; value: number };

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
};

export function BySaveChart({ series, marks, range, axisName, describe }: BySaveChartProps) {
  const dark = isDarkMode();
  const option = useMemo((): EChartsOption => {
    const [first, last] = range.map(dayNumber);
    const pad = Math.max(30, Math.round((last - first) * 0.02));
    const ink = dark ? "#cbd5e1" : "#334155";
    return {
      animation: false,
      grid: { left: 64, right: 24, top: 24, bottom: 48 },
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
          data: entry.points.map((point) => ({
            value: [point.day, point.value],
            lines: describe(entry, point),
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
            lines: [formatLongDate(dateFromDayNumber(mark.day)), mark.reason],
          })),
        },
      ],
    };
  }, [series, marks, range, axisName, describe, dark]);
  return <EChart option={option} style={{ height: "360px", width: "100%" }} />;
}

/** Near black and near white game colors get a neutral outline. */
function needsOutline(color: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return false;
  const [r, g, b] = match.slice(1).map((hex) => parseInt(hex, 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.08 || luminance > 0.92;
}
