import type { GameTheme } from "@/components/GameThemeProvider";
import { formatTick } from "@/features/eu5/numberFormatting";

/**
 * EU5's dark-only chart palette. Slot order is CVD-safe; assign colors in order
 * and do not cycle.
 */
const SERIES = [
  "#1a9f99", // 1 verdigris
  "#bb5e1f", // 2 sanguine
  "#a17fda", // 3 smalt
  "#b76263", // 4 carmine
  "#6a8dce", // 5 indigo
  "#4c8d57", // 6 terre verte
  "#c178a9", // 7 madder
] as const;

/**
 * Resolve indexes from stable entity keys, not sorted positions. More than
 * seven series must be collapsed into "Other" or split into separate charts.
 */
export function seriesColor(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= SERIES.length) {
    throw new RangeError(
      `Series index must be an integer between 0 and ${SERIES.length - 1}: ${index}`,
    );
  }
  return SERIES[index]!;
}

export const seriesColors: readonly string[] = SERIES;

/** Sequential magnitude ramp: near-zero is dark and larger values are lighter. */
export const sequentialRamp = [
  "#002b29",
  "#054340",
  "#0f5d59",
  "#1b7873",
  "#26948f",
  "#32b1ab",
  "#3ed0c8",
] as const;

/** Ordered categories, capped at the five validated lightness steps. */
const ORDINAL_5 = ["#005a56", "#047470", "#178f8a", "#26aca6", "#35c9c2"] as const;

/** Evenly spaced in OKLab; sampling ORDINAL_5 would produce uneven gaps. */
const ORDINAL_4 = ["#005a56", "#127d78", "#23a29c", "#35c9c2"] as const;

export function ordinalRamp(steps: number): string[] {
  const n = Math.max(1, Math.min(steps, ORDINAL_5.length));
  if (n === 1) return [ORDINAL_5[ORDINAL_5.length - 1]!];
  if (n === 4) return [...ORDINAL_4];
  return Array.from(
    { length: n },
    (_, i) => ORDINAL_5[Math.round((i * (ORDINAL_5.length - 1)) / (n - 1))]!,
  );
}

/** Diverging polarity ramp with a neutral midpoint. */
export const divergingRamp = [
  "#bb5e1f", // sanguine — slot 2, unchanged
  "#894d28",
  "#5b3b29",
  "#25292e", // neutral, just above the panel
  "#3d4961",
  "#536a94",
  "#6a8dce", // indigo — slot 5, unchanged
] as const;

/** Poles for two-way splits such as surplus/shortage or over/under. */
export const divergingPoles = { warm: "#bb5e1f", cool: "#6a8dce" } as const;

/** Brass retains its application-wide meaning of selected/active. */
export const selectionColor = "#ce9a43";

/** Status colors describe state, never series identity. Pair them with labels. */
export const statusColors = {
  good: "#10b981",
  warn: "#f59e0b",
  err: "#f43f5e",
  info: "#38bdf8",
} as const;

export const chartInk = {
  /** Values and axis names. */
  primary: "#f2eade",
  /** Bright small text and reference lines. */
  secondary: "#c5c0b8",
  /** All chart text, the same as `--game-ink-500`. */
  tick: "#aca79f",
  /** Non-text annotations and in-plot metadata. */
  muted: "#7d7a74",
  surface: "#0e1217",
  /** Bar tracks and empty cells. */
  track: "#161b21",
} as const;

/**
 * A chart with one series that shows a magnitude. The series identifies
 * nothing on the map, so it does not take a data colour. A mid grey stays
 * quieter than the data colours and has 5:1 on the chart surface.
 */
export const neutralMark = "#8a857e";

/** The fill under a neutral line. */
export const neutralFill = "rgba(138,133,126,0.12)";

/** Text in a chart: one size and one muted colour. */
export const chartText = {
  color: chartInk.tick,
  fontFamily: '"Public Sans", -apple-system, system-ui, "Segoe UI", sans-serif',
  fontSize: 12,
  fontWeight: 400,
} as const;

/** Text in a chart that is a number or a tag, such as the value at the end of a bar. */
export const chartNumberText = {
  ...chartText,
  fontFamily: '"IBM Plex Mono", ui-monospace, "JetBrains Mono", monospace',
} as const;

/** An outline in the surface colour, so that a label over a dot stays clear. */
export const labelHalo = { textBorderColor: chartInk.surface, textBorderWidth: 2 } as const;

/** The hairlines of a chart: a grid line at each tick, and the axis line. */
const chartLine = { grid: "rgba(255,255,255,0.06)", axis: "rgba(255,255,255,0.1)" } as const;

const axisLine = { lineStyle: { color: chartLine.axis } };
const gridLines = { lineStyle: { color: chartLine.grid, type: "solid" as const, width: 1 } };

const valueAxis = {
  axisLabel: { ...chartNumberText, formatter: (value: number) => formatTick(value) },
  nameTextStyle: chartText,
  axisLine,
  splitLine: gridLines,
};

const eu5ChartTheme = {
  textStyle: chartText,
  categoryAxis: { axisLabel: chartText, nameTextStyle: chartText, axisLine },
  valueAxis,
  logAxis: valueAxis,
  timeAxis: {
    axisLabel: chartNumberText,
    nameTextStyle: chartText,
    axisLine,
    splitLine: gridLines,
  },
  legend: { textStyle: chartText, pageTextStyle: chartText },
  visualMap: { textStyle: chartText },
};

/**
 * The ECharts theme of a game. EU5 charts get one text style, hairline axes,
 * and a grid line and a compact tick on each value axis. A chart option can
 * replace each part. Other games
 * get no theme, so their charts do not change.
 */
export function chartTheme(game: GameTheme | undefined): object | undefined {
  return game === "eu5" ? eu5ChartTheme : undefined;
}

/**
 * The name of a y axis: flat, over the top of the axis, and from the axis
 * line toward the plot. The plot needs space above it for the name.
 */
export function yAxisName(name: string, side: "left" | "right" = "left") {
  return {
    name,
    nameLocation: "end" as const,
    nameGap: 10,
    nameTextStyle: { align: side === "left" ? ("left" as const) : ("right" as const) },
  };
}

/** Shared EU5 tooltip styling. */
export const chartTooltip = {
  backgroundColor: "rgba(8,11,16,0.72)",
  borderColor: "rgba(255,255,255,0.1)",
  borderWidth: 1,
  padding: [6, 10] as [number, number],
  textStyle: { color: chartInk.primary, fontSize: 12 },
  extraCssText:
    "backdrop-filter: blur(8px); border-radius: 3px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);",
} as const;

/** A 2px surface-coloured gap so adjacent and stacked fills never fuse. */
export const markGap = { borderColor: chartInk.surface, borderWidth: 2 } as const;

/**
 * Shared zoom styling. Callers add the type, axis index, and orientation-specific
 * geometry. Brass is limited to the handles so a full-width slider stays quiet.
 */
export const chartDataZoomSlider = {
  backgroundColor: chartInk.track,
  borderColor: "rgba(255,255,255,0.1)",
  borderRadius: 3,
  fillerColor: "rgba(255,255,255,0.05)",
  handleStyle: { color: chartInk.track, borderColor: selectionColor, borderWidth: 1 },
  moveHandleStyle: { color: "rgba(255,255,255,0.1)" },
  emphasis: {
    handleStyle: { color: selectionColor, borderColor: selectionColor, borderWidth: 1 },
    moveHandleStyle: { color: "rgba(206,154,67,0.55)" },
  },
  dataBackground: {
    lineStyle: { color: chartInk.muted, width: 1, opacity: 0.5 },
    areaStyle: { color: chartInk.muted, opacity: 0.15 },
  },
  selectedDataBackground: {
    lineStyle: { color: chartInk.secondary, width: 1, opacity: 0.8 },
    areaStyle: { color: chartInk.secondary, opacity: 0.2 },
  },
  textStyle: chartNumberText,
} as const;
