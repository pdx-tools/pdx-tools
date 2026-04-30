export interface EChartsTheme {
  axisColor: string;
  axisPointerLabelBackgroundColor: string;
  backgroundColor: string;
  labelColor: string;
  legendPageColor: string;
  gridLineColor: string;
  mutedTextColor: string;
  neutralSeriesColor: string;
  tickColor: string;
  tooltipBackgroundColor: string;
  tooltipBorderColor: string;
  tooltipTextColor: string;
  zoomFillerColor: string;
  zoomHandleColor: string;
}

export function getEChartsTheme(isDark: boolean): EChartsTheme {
  return isDark
    ? {
        axisColor: "#64748b",
        axisPointerLabelBackgroundColor: "#334155",
        backgroundColor: "transparent",
        labelColor: "#f8fafc",
        legendPageColor: "#cbd5e1",
        gridLineColor: "#475569",
        mutedTextColor: "#94a3b8",
        neutralSeriesColor: "#93c5fd",
        tickColor: "#cbd5e1",
        tooltipBackgroundColor: "rgba(15, 23, 42, 0.96)",
        tooltipBorderColor: "rgba(148, 163, 184, 0.35)",
        tooltipTextColor: "#f8fafc",
        zoomFillerColor: "rgba(147, 197, 253, 0.22)",
        zoomHandleColor: "#93c5fd",
      }
    : {
        axisColor: "#94a3b8",
        axisPointerLabelBackgroundColor: "#e2e8f0",
        backgroundColor: "transparent",
        labelColor: "#0f172a",
        legendPageColor: "#475569",
        gridLineColor: "#cbd5e1",
        mutedTextColor: "#475569",
        neutralSeriesColor: "#2563eb",
        tickColor: "#475569",
        tooltipBackgroundColor: "rgba(255, 255, 255, 0.98)",
        tooltipBorderColor: "rgba(148, 163, 184, 0.45)",
        tooltipTextColor: "#0f172a",
        zoomFillerColor: "rgba(37, 99, 235, 0.16)",
        zoomHandleColor: "#2563eb",
      };
}
