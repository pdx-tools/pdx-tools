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

/**
 * The hairline around a dot in a game colour, the same as `--game-rim`. A dark
 * colour stays visible on the plot, and the colour does not change.
 */
export const dotRim = { borderColor: "rgba(255, 255, 255, 0.28)", borderWidth: 1 } as const;

/** Translucent fill under a line or area series, keyed to its slot. */
export function seriesFill(index: number, alpha = 0.12): string {
  const hex = seriesColor(index);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  /** The neutral mark of one series, the same as `--game-ink-300`. Also bright small text. */
  secondary: "#c5c0b8",
  /** All chart text, the same as `--game-ink-500`: 7.9:1 against the chart surface. */
  tick: "#aca79f",
  /** Non-text annotations and in-plot metadata. */
  muted: "#7d7a74",
  surface: "#0e1217",
  /** Bar tracks and empty cells. */
  track: "#161b21",
} as const;

/**
 * One series that shows a magnitude: the neutral colour of a list's bar. It
 * identifies nothing on the map, so it has no data colour (Single-Series Rule).
 */
export const neutralMark = chartInk.secondary;

/** The bars of a histogram: dimmer than a line, so that the brass median and p90 show on them. */
export const histogramBar = chartInk.muted;

/**
 * The plot's edges in a stack of charts, so that the charts of a level share
 * their left and right edges. The left gutter takes the longest category label.
 */
export const chartGutter = { left: 72, right: 24 } as const;

/**
 * The name of a chart's y axis: flat, over the axis, and from the axis line
 * to the right. An x axis has its name centred under it. Each chart has this rule.
 */
export function yAxisName(name: string, gap = 8) {
  return {
    name,
    nameLocation: "end" as const,
    nameGap: gap,
    nameTextStyle: { color: chartInk.tick, fontSize: 12, align: "left" as const },
  };
}

/** The fill under a neutral line. */
export const neutralFill = "rgba(197,192,184,0.12)";

export interface EChartsTheme {
  axisColor: string;
  gridLineColor: string;
  tickColor: string;
  numFamily: string;
}

const NUM_FAMILY = '"IBM Plex Mono", ui-monospace, "JetBrains Mono", monospace';

/**
 * Text in a plot that is a number or a tag, such as a value at the end of a
 * bar. The EU5 surface gives the same set to the ticks of a value axis
 * (`--game-chart-num-font` in `EChart`).
 */
export const chartNumberText = {
  color: chartInk.tick,
  fontFamily: NUM_FAMILY,
  fontSize: 12,
  fontWeight: 400,
} as const;

/**
 * Axis, grid and label styling. No mode argument: the surface is always dark.
 */
export function getEChartsTheme(): EChartsTheme {
  return {
    axisColor: "rgba(255,255,255,0.1)",
    gridLineColor: "rgba(255,255,255,0.06)",
    tickColor: chartInk.tick,
    numFamily: NUM_FAMILY,
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
  textStyle: { color: chartInk.tick, fontSize: 12 },
} as const;
