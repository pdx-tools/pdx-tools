export interface EChartsTheme {
  axisColor: string;
  labelColor: string;
  gridLineColor: string;
  tickColor: string;
}

export function getEChartsTheme(isDark: boolean): EChartsTheme {
  return isDark
    ? { axisColor: "#666", labelColor: "#fff", gridLineColor: "#444", tickColor: "#bbb" }
    : { axisColor: "#999", labelColor: "#000", gridLineColor: "#ccc", tickColor: "#666" };
}

/**
 * Series colors shared across charts, resolved per theme.
 *
 * These are the pairs that were already repeated verbatim across chart option
 * builders; the names record how each was being used, not what hue it is. The
 * values are unchanged from what those builders had inline, so this is a single
 * place to edit rather than a new palette. Charts still borrow from the Classic
 * (Tailwind) palette rather than the game tokens — deciding whether that stays
 * true is the open question a real chart palette has to answer.
 *
 * One-off colors that appear in a single builder deliberately stay inline.
 */
export interface EChartsSeriesColors {
  /** Default mark for scatter points and bars, and the usual per-datum fallback. */
  primary: string;
  /** The counterpart series when one is plotted against `primary` or `accent`. */
  contrast: string;
  /** Second categorical series in bar and histogram builders. */
  accent: string;
  /** Emphasized trend line and its markers. */
  highlight: string;
  /** Line and area series, and the per-datum fallback in line charts. */
  line: string;
  /** Data labels drawn on the plot area. */
  labelInk: string;
  /** Dashed reference lines and secondary annotations. */
  muted: string;
}

export function getEChartsSeriesColors(isDark: boolean): EChartsSeriesColors {
  return isDark
    ? {
        primary: "#93c5fd",
        contrast: "#f97316",
        accent: "#38bdf8",
        highlight: "#f59e0b",
        line: "#60a5fa",
        labelInk: "#e2e8f0",
        muted: "#94a3b8",
      }
    : {
        primary: "#3b82f6",
        contrast: "#ea580c",
        accent: "#0ea5e9",
        highlight: "#d97706",
        line: "#2563eb",
        labelInk: "#1e293b",
        muted: "#64748b",
      };
}
