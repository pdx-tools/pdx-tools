import { useEffectEvent, useMemo } from "react";
import type * as echarts from "echarts/core";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { isDarkMode } from "@/lib/dark";
import { MONTH_ABBR, dateFromDayNumber, dayNumber } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";

/** One dot: a country's value in one save, in the game color of the tag it held then. */
export type BySavePoint = { day: number; value: number; color: string };

export type BySaveSeries = { key: string; points: BySavePoint[] };

export type BySaveChartProps = {
  series: BySaveSeries[];
  /** The first and last save date of the campaign. */
  range: [DateComponents, DateComponents];
  /** The value as an axis tick, such as "80K". */
  tick: (value: number) => string;
  /** The day of the selected save, drawn as a rule through the plot. */
  selectedDay: number | null;
  /** The day of the open save when it is not the selected one. */
  openDay: number | null;
  /** The day of the save under the pointer, drawn as a light rule. */
  hoverDay: number | null;
  /** The day under the pointer, or null when it leaves the plot. */
  onPointer: (day: number | null) => void;
  /** A click on the plot picks the day under the pointer. */
  onPick: (day: number) => void;
};

export function BySaveChart({
  series,
  range,
  tick,
  selectedDay,
  openDay,
  hoverDay,
  onPointer,
  onPick,
}: BySaveChartProps) {
  const dark = isDarkMode();
  const option = useMemo((): EChartsOption => {
    const [first, last] = range.map(dayNumber);
    // Half a dot beyond the first and last save.
    const pad = Math.max(5, Math.round((last - first) * 0.006));
    const ink = dark ? "#cbd5e1" : "#334155";
    const { ticks, label } = timeTicks(first - pad, last + pad);
    const rule = (day: number, type: "solid" | "dashed", opacity = 1, label?: string) => ({
      xAxis: day,
      lineStyle: { color: ink, type, width: type === "dashed" ? 2 : 1, opacity },
      label: label
        ? { show: true, formatter: label, position: "end" as const, color: ink }
        : { show: false },
    });
    const rules = [
      ...(hoverDay !== null && hoverDay !== selectedDay ? [rule(hoverDay, "solid", 0.35)] : []),
      ...(selectedDay !== null
        ? [rule(selectedDay, selectedDay === openDay ? "dashed" : "solid")]
        : []),
      ...(openDay !== null && openDay !== selectedDay ? [rule(openDay, "dashed", 1, "Open")] : []),
    ];
    return {
      animation: false,
      // The table under the chart is the legend: its swatches are these colors.
      grid: { left: 48, right: 16, top: 24, bottom: 28 },
      tooltip: { show: false },
      xAxis: {
        type: "value",
        min: first - pad,
        max: last + pad,
        axisTick: { customValues: ticks },
        axisLabel: { color: ink, customValues: ticks, formatter: label },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { color: ink, formatter: tick },
      },
      series: [
        ...series.map((entry) => ({
          type: "scatter" as const,
          name: entry.key,
          symbolSize: 8,
          silent: true,
          data: entry.points.map((point) => ({
            value: [point.day, point.value],
            itemStyle: {
              // The game's color, unchanged.
              opacity: 1,
              color: point.color,
              borderColor: needsOutline(point.color) ? ink : undefined,
              borderWidth: needsOutline(point.color) ? 1 : 0,
            },
          })),
        })),
        {
          type: "scatter" as const,
          silent: true,
          data: [],
          markLine: { silent: true, symbol: ["none", "none"], animation: false, data: rules },
        },
      ],
    };
  }, [series, range, tick, selectedDay, openDay, hoverDay, dark]);
  const onInit = useEffectEvent((chart: echarts.ECharts) => {
    const day = (event: { offsetX: number; offsetY: number }) => {
      const point = [event.offsetX, event.offsetY];
      if (!chart.containPixel("grid", point)) return null;
      const [value] = chart.convertFromPixel("grid", point) as number[];
      return value;
    };
    const zr = chart.getZr();
    const onMove = (event: { offsetX: number; offsetY: number }) => onPointer(day(event));
    const onOut = () => onPointer(null);
    const onClick = (event: { offsetX: number; offsetY: number }) => {
      const at = day(event);
      if (at !== null) onPick(at);
    };
    zr.on("mousemove", onMove);
    zr.on("globalout", onOut);
    zr.on("click", onClick);
    return () => {
      zr.off("mousemove", onMove);
      zr.off("globalout", onOut);
      zr.off("click", onClick);
    };
  });
  return (
    <EChart
      option={option}
      onInit={(chart) => onInit(chart)}
      style={{ height: "320px", width: "100%" }}
    />
  );
}

/** A round number of years between ticks, for a span of years. */
function yearStep(years: number) {
  return [1, 2, 5, 10, 20, 25, 50, 100].find((step) => years / step <= 10) ?? 100;
}

/**
 * Ticks on the first day of round years, or of months when the axis holds
 * fewer than two years, such as for saves within one year.
 */
export function timeTicks(min: number, max: number) {
  const inRange = (day: number) => day >= min && day <= max;
  const start = dateFromDayNumber(min);
  const end = dateFromDayNumber(max);
  const step = yearStep((max - min) / 365);
  const firstYear = Math.ceil(start.year / step) * step;
  const years = Array.from(
    { length: Math.max(0, Math.floor((end.year - firstYear) / step) + 1) },
    (_, i) => dayNumber({ year: firstYear + i * step, month: 1, day: 1 }),
  ).filter(inRange);
  if (years.length >= 2) {
    return { ticks: years, label: (day: number) => String(dateFromDayNumber(day).year) };
  }
  const span = (end.year - start.year) * 12 + end.month - start.month;
  const months = [1, 2, 3, 6].find((x) => span / x <= 8) ?? 12;
  const ticks: number[] = [];
  for (let at = start.year * 12 + start.month - 1; at <= end.year * 12 + end.month - 1; at++) {
    const month = (at % 12) + 1;
    const day = dayNumber({ year: Math.floor(at / 12), month, day: 1 });
    if ((month - 1) % months === 0 && inRange(day)) ticks.push(day);
  }
  return {
    ticks,
    label: (day: number) => {
      const date = dateFromDayNumber(day);
      return `${MONTH_ABBR[date.month]} ${date.year}`;
    },
  };
}

/** Near black and near white game colors get a neutral outline. */
function needsOutline(color: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return false;
  const [r, g, b] = match.slice(1).map((hex) => parseInt(hex, 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.08 || luminance > 0.92;
}
