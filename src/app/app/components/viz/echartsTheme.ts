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
