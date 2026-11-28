export const CHART_UPDATE_DURATION = 800;
export const CHART_UPDATE_EASING = "cubicInOut";

export const easeChartUpdate = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export const interpolate = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;
