import type * as echarts from "echarts/core";
import { FRAME_INTERVAL_MS } from "./chartMotion";

/**
 * Isolated adapters for ECharts 6.1 / ZRender internals that are not exposed
 * in ECharts' public TypeScript definitions. Keep all private access here so
 * version upgrades have one surface to audit and callers can fail closed.
 */

export type BarRectGraphic = InstanceType<typeof echarts.graphic.Rect>;

export type SankeyShape = Record<string, number | string | number[]>;

export interface SankeyGraphic {
  shape?: SankeyShape;
  style?: { opacity?: number };
  stopAnimation: () => void;
  animateFrom: (props: object, options: { duration: number; easing: string }) => void;
  disableLabelAnimation?: boolean;
}

export interface CartesianAxisInternal extends echarts.Axis {
  toGlobalCoord(value: number): number;
}

export interface Cartesian2DCoord {
  type?: string;
  master: { getRect(): { x: number; y: number; width: number; height: number } };
  getBaseAxis(): CartesianAxisInternal;
  getOtherAxis(axis: echarts.Axis): CartesianAxisInternal;
  getAxis?(dim: "x" | "y"): CartesianAxisInternal | undefined;
}

export interface EChartsDataInternal {
  count(): number;
  getId(index: number): string;
  getRawDataItem(index: number): unknown;
  getItemGraphicEl(index: number): unknown;
}

export interface EChartsSeriesInternal {
  id: string;
  subType: string;
  seriesIndex: number;
  coordinateSystem?: Cartesian2DCoord;
  getData(kind?: string): EChartsDataInternal;
  getDataParams(index: number): echarts.ECElementEvent;
  get(path: string | readonly string[]): unknown;
}

export interface EChartsGlobalModel {
  eachSeries(visit: (series: EChartsSeriesInternal) => void): void;
  getSeriesByIndex?(seriesIndex: number): EChartsSeriesInternal | undefined;
}

export function getChartModel(chart: echarts.ECharts): EChartsGlobalModel | undefined {
  const accessor = chart as unknown as { getModel?: () => EChartsGlobalModel | undefined };
  return typeof accessor.getModel === "function" ? accessor.getModel() : undefined;
}

export function getCartesian2DCoord(
  chart: echarts.ECharts,
  seriesIndex: number,
): Cartesian2DCoord | undefined {
  const model = getChartModel(chart);
  if (!model) return undefined;
  let found: EChartsSeriesInternal | undefined;
  if (typeof model.getSeriesByIndex === "function") {
    found = model.getSeriesByIndex(seriesIndex);
  } else {
    let idx = 0;
    model.eachSeries((series) => {
      if (idx === seriesIndex) found = series;
      idx++;
    });
  }
  const coord = found?.coordinateSystem;
  return coord?.type === "cartesian2d" ? coord : undefined;
}

/**
 * Look up an existing ZRender canvas for `zlevel` without mutating Painter's
 * layer table (unlike `painter.getLayer(zlevel)` which creates missing layers).
 */
export function findZLevelCanvas(chart: echarts.ECharts, zlevel: number): HTMLCanvasElement | null {
  const painter = chart.getZr().painter as unknown as {
    getLayers?: () => Record<number, { dom?: HTMLElement } | undefined> | undefined;
    getViewportRoot?: () => HTMLElement;
  };
  const layerDom = painter.getLayers?.()?.[zlevel]?.dom;
  if (layerDom instanceof HTMLCanvasElement) return layerDom;
  const viewport = painter.getViewportRoot?.();
  return (
    viewport?.querySelector<HTMLCanvasElement>(`canvas[data-zr-dom-id^="zr_${zlevel}."]`) ?? null
  );
}

export function refreshZRenderImmediately(chart: echarts.ECharts): void {
  chart.getZr().refreshImmediately();
}

export function setZRenderAnimationRunning(chart: echarts.ECharts, running: boolean): void {
  const animation = chart.getZr().animation;
  if (running) animation.start();
  else animation.stop();
}

export function setZRenderCursor(chart: echarts.ECharts, cursor: string): void {
  chart.getZr().setCursorStyle(cursor);
}

/** Read the destination rect shape from any in-flight ZRender shape animators. */
export function readTargetBarShape(element: BarRectGraphic) {
  const shape = { ...element.shape };
  for (const animator of element.animators) {
    if (animator.targetName !== "shape") continue;
    for (const track of animator.getTracks()) {
      const value = track.keyframes.at(-1)?.rawValue;
      if (typeof value === "number" && track.propName in shape) {
        Object.assign(shape, { [track.propName]: value });
      }
    }
  }
  return shape;
}

/** Stop CPU-side geometry animation when no attached label needs host rect tweening. */
export function stopUnlabeledBarShapeAnimators(element: BarRectGraphic): void {
  const label = element.getTextContent();
  if (label && !label.ignore && label.style.text) return;
  for (const animator of element.animators.slice()) {
    if (animator.targetName === "shape") animator.stop(true);
  }
}

export function isGraphicAttached(element: BarRectGraphic): boolean {
  return Boolean(element.parent);
}

export function setGraphicHidden(
  element: BarRectGraphic,
  invisible: boolean,
  silent: boolean,
): boolean {
  if (element.invisible === invisible && element.silent === silent) return false;
  element.invisible = invisible;
  element.silent = silent;
  element.markRedraw();
  return true;
}

/**
 * Canvas text painting dominated the profile on a 180 Hz display.
 * Advance ZRender chart animations at at most 60 Hz, retaining wall-clock duration.
 * Explicit synchronous updates (`notTriggerFrameAndStageUpdate`) must run immediately.
 */
export function throttleZRenderAnimation(chart: echarts.ECharts): void {
  const animation = chart.getZr().animation;
  const update = animation.update.bind(animation);
  let lastFrame = -Infinity;
  animation.update = (notTriggerFrameAndStageUpdate?: boolean) => {
    const now = performance.now();
    if (!notTriggerFrameAndStageUpdate && now - lastFrame < FRAME_INTERVAL_MS) return;
    lastFrame = now;
    update(notTriggerFrameAndStageUpdate);
  };
}
