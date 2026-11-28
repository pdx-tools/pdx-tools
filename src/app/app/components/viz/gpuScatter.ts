import {
  CHART_UPDATE_DURATION,
  clampedProgress,
  createFrameLoop,
  interpolate,
  prefersReducedMotion,
} from "./chartMotion";
import {
  findZLevelCanvas,
  getCartesian2DCoord,
  refreshZRenderImmediately,
  setZRenderCursor,
} from "./echartsInternals";
import { chartInk, chartText, chartTooltip } from "./echartsTheme";
import * as echarts from "echarts/core";
import type { ScatterSeriesOption } from "echarts/charts";
import type { EChartsOption } from "./EChart";

type DatumItemStyle = {
  color?: string;
  opacity?: number;
  borderColor?: string;
  borderWidth?: number;
};

type DatumObject = {
  id?: string | number;
  tag?: string;
  name?: string;
  value: number[];
  color?: string;
  symbolSize?: number;
  itemStyle?: DatumItemStyle;
  label?: { show?: boolean };
};

type Datum = DatumObject | number[];

type RGBA = [number, number, number, number];
type GridRect = { x: number; y: number; width: number; height: number };

type Point = {
  key: string;
  data: Datum;
  index: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  alpha: number;
  fromSize: number;
  toSize: number;
  fill: RGBA;
  border: RGBA;
  borderWidth: number;
  visible: boolean;
};

const FLOATS_PER_POINT = 17;
const DEFAULT_FILL: RGBA = [26 / 255, 159 / 255, 153 / 255, 1];
const TRANSPARENT: RGBA = [0, 0, 0, 0];

const isDatumObject = (d: Datum): d is DatumObject =>
  Boolean(d) && typeof d === "object" && !Array.isArray(d);

const datumValue = (d: Datum): number[] => (Array.isArray(d) ? d : d.value);

const datumKey = (d: Datum, fallbackIndex: number) =>
  isDatumObject(d) ? String(d.id ?? d.tag ?? d.name ?? fallbackIndex) : String(fallbackIndex);

function seriesArray(option: EChartsOption) {
  return option.series == null
    ? []
    : Array.isArray(option.series)
      ? option.series
      : [option.series];
}

/**
 * Returns the index of the single Cartesian scatter series, or -1 if the option
 * has zero or multiple scatter series (in which case ECharts renders it directly).
 */
export function findScatterSeriesIndex(option: EChartsOption): number {
  const list = seriesArray(option);
  let found = -1;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s?.type !== "scatter") continue;
    if (found >= 0) return -1;
    if (!Array.isArray(s.data) || (s.coordinateSystem && s.coordinateSystem !== "cartesian2d")) {
      return -1;
    }
    found = i;
  }
  return found;
}

// ECharts retains axes, reference lines, zoom, and sparse labels. Only the dense point layer uses WebGL.
export function createGpuScatter(chart: echarts.ECharts, fallback: () => void) {
  const container = chart.getDom() as HTMLDivElement;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  });
  if (!gl) return;
  const pointSizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as
    | Float32Array
    | number[]
    | null;
  const maxHardwarePointSize =
    pointSizeRange && typeof pointSizeRange[1] === "number" && pointSizeRange[1] > 0
      ? pointSizeRange[1]
      : 64;

  const program = gl.createProgram();
  if (!program) return;
  const shaders: WebGLShader[] = [];
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Cannot create scatterplot shader");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error("Cannot compile scatterplot shader");
    gl.attachShader(program, shader);
  };
  try {
    compile(
      gl.VERTEX_SHADER,
      `
      attribute vec2 aFrom;
      attribute vec2 aTo;
      attribute vec4 aColor;
      attribute vec4 aBorder;
      attribute vec2 aAlpha;
      attribute vec2 aSize;
      attribute float aBorderWidth;
      uniform vec2 uSize;
      uniform float uProgress;
      uniform mediump float uRatio;
      varying vec4 vColor;
      varying vec4 vBorder;
      varying mediump float vPointSize;
      varying mediump float vBorderPx;
      varying mediump float vFade;
      void main() {
        vec2 p = mix(aFrom, aTo, uProgress) / uSize;
        gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
        float pointSize = mix(aSize.x, aSize.y, uProgress);
        vPointSize = pointSize * uRatio + 1.0;
        vBorderPx = aBorderWidth * uRatio;
        gl_PointSize = vPointSize;
        vFade = mix(aAlpha.x, aAlpha.y, uProgress) * step(0.0001, pointSize);
        vColor = aColor;
        vBorder = aBorder;
      }`,
    );
    compile(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      varying vec4 vColor;
      varying vec4 vBorder;
      varying mediump float vPointSize;
      varying mediump float vBorderPx;
      varying mediump float vFade;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5)) * vPointSize;
        float outerR = (vPointSize - 1.0) * 0.5;
        float coverage = clamp(outerR - dist + 0.5, 0.0, 1.0);
        if (coverage <= 0.0 || vFade <= 0.0) discard;
        vec3 rgb = vColor.rgb;
        float alpha = vColor.a;
        if (vBorderPx > 0.0 && vBorder.a > 0.0) {
          float innerR = max(0.0, outerR - vBorderPx);
          float borderMix = clamp(dist - innerR + 0.5, 0.0, 1.0);
          float bA = vBorder.a * borderMix;
          float outA = bA + alpha * (1.0 - bA);
          rgb = outA > 0.0001 ? (vBorder.rgb * bA + rgb * alpha * (1.0 - bA)) / outA : rgb;
          alpha = outA;
        }
        gl_FragColor = vec4(rgb, alpha * vFade * coverage);
      }`,
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Cannot link scatterplot shader");
  } catch {
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    return;
  }
  const buffer = gl.createBuffer();
  if (!buffer) {
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    return;
  }

  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  canvas.dataset.renderer = "gpu-scatter";
  canvas.style.cssText = "position:absolute;inset:0;pointer-events:none";
  container.insertBefore(canvas, container.firstChild);

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const strideBytes = FLOATS_PER_POINT * 4;
  for (const [name, size, offset] of [
    ["aFrom", 2, 0],
    ["aTo", 2, 2],
    ["aColor", 4, 4],
    ["aBorder", 4, 8],
    ["aAlpha", 2, 12],
    ["aSize", 2, 14],
    ["aBorderWidth", 1, 16],
  ] as const) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, strideBytes, offset * 4);
  }
  const sizeUniform = gl.getUniformLocation(program, "uSize");
  const progressUniform = gl.getUniformLocation(program, "uProgress");
  const ratioUniform = gl.getUniformLocation(program, "uRatio");
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const colorCache = new Map<string, RGBA>();
  const parseColor = (value: unknown, fallbackColor: RGBA): RGBA => {
    if (typeof value !== "string") return fallbackColor;
    const cached = colorCache.get(value);
    if (cached) return cached;
    const parsed = echarts.color.parse(value);
    if (!parsed) return fallbackColor;
    const rgba: RGBA = [parsed[0] / 255, parsed[1] / 255, parsed[2] / 255, parsed[3]];
    if (colorCache.size < 512) colorCache.set(value, rgba);
    return rgba;
  };

  let points: Point[] = [];
  let vertexData = new Float32Array(0);
  let gpuBufferFloats = 0;
  let scatterSeriesIndex = 0;
  let gridRect: GridRect | null = null;
  let started = 0;
  let duration = 0;
  let maxPointSize = 8;
  let paused = false;
  let option: EChartsOption | undefined;
  let hovered: Point | undefined;
  let pointerPos: { x: number; y: number } | null = null;
  let tooltipText: string | undefined;
  let tooltipWidth = 0;
  let tooltipHeight = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let canvasRatio = 0;

  const eventParams = (point: Point, event?: MouseEvent) =>
    ({
      componentType: "series",
      seriesType: "scatter",
      seriesIndex: scatterSeriesIndex,
      dataIndex: point.index,
      data: point.data,
      name: isDatumObject(point.data) ? point.data.name : undefined,
      value: datumValue(point.data),
      ...(event ? { event: { event } } : {}),
    }) as unknown as echarts.ECElementEvent;

  const tooltip = document.createElement("div");
  tooltip.style.cssText =
    "display:none;position:absolute;z-index:100;pointer-events:none;border-radius:3px;padding:6px 10px;white-space:nowrap";
  container.appendChild(tooltip);

  const applyTooltipTheme = (next: EChartsOption) => {
    const settings = Array.isArray(next.tooltip) ? next.tooltip[0] : next.tooltip;
    Object.assign(tooltip.style, {
      background: settings?.backgroundColor ?? chartTooltip.backgroundColor,
      color: settings?.textStyle?.color ?? chartInk.primary,
      fontSize: `${settings?.textStyle?.fontSize ?? chartTooltip.textStyle.fontSize}px`,
      fontFamily: settings?.textStyle?.fontFamily ?? chartText.fontFamily,
      border: `1px solid ${settings?.borderColor ?? chartTooltip.borderColor}`,
      backdropFilter: "blur(8px)",
      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    });
  };

  const clearHover = () => {
    if (hovered) {
      chart.trigger("mouseout", eventParams(hovered));
      setZRenderCursor(chart, "default");
    }
    hovered = undefined;
    tooltip.style.display = "none";
  };

  const resolveGridRect = (width: number, height: number): GridRect | null => {
    if (gridRect) return gridRect;
    const grid = option ? (Array.isArray(option.grid) ? option.grid[0] : option.grid) : undefined;
    if (
      grid &&
      typeof grid.left === "number" &&
      typeof grid.right === "number" &&
      typeof grid.top === "number" &&
      typeof grid.bottom === "number"
    ) {
      return {
        x: grid.left,
        y: grid.top,
        width: Math.max(0, width - grid.left - grid.right),
        height: Math.max(0, height - grid.top - grid.bottom),
      };
    }
    return null;
  };

  const pickAt = (x: number, y: number, now: number) => {
    const pad = maxPointSize / 2 + 2;
    const plot = resolveGridRect(
      canvasWidth || chart.getWidth(),
      canvasHeight || chart.getHeight(),
    );
    if (plot) {
      if (
        x < plot.x - pad ||
        x > plot.x + plot.width + pad ||
        y < plot.y - pad ||
        y > plot.y + plot.height + pad
      ) {
        return undefined;
      }
    } else if (!chart.containPixel({ gridIndex: 0 }, [x, y])) {
      return undefined;
    }

    const t = clampedProgress(started, duration, now);
    // WebGL paints later points on top, so hit testing follows reverse draw order.
    for (let i = points.length - 1; i >= 0; i--) {
      const point = points[i]!;
      if (!point.visible || interpolate(point.alpha, 1, t) < 0.01) continue;
      const px = interpolate(point.fromX, point.toX, t);
      const py = interpolate(point.fromY, point.toY, t);
      const size = interpolate(point.fromSize, point.toSize, t);
      if (size <= 0) continue;
      const radius = size / 2 + 2;
      if ((px - x) ** 2 + (py - y) ** 2 <= radius * radius) return point;
    }
    return undefined;
  };

  const positionTooltip = (x: number, y: number) => {
    const width = canvasWidth || chart.getWidth();
    const height = canvasHeight || chart.getHeight();
    tooltip.style.left = `${Math.max(0, Math.min(x + 12, width - tooltipWidth - 4))}px`;
    tooltip.style.top = `${Math.max(0, Math.min(y + 12, height - tooltipHeight - 4))}px`;
  };

  const updateTooltipFor = (point: Point, x: number, y: number) => {
    const settings = option
      ? Array.isArray(option.tooltip)
        ? option.tooltip[0]
        : option.tooltip
      : undefined;
    if (settings?.show === false) {
      tooltip.style.display = "none";
      return;
    }
    const formatter = settings?.formatter;
    if (typeof formatter !== "function") return;
    const text = formatter(eventParams(point) as never, "gpu", () => {});
    if (typeof text === "string" && text.length > 0) {
      tooltip.style.display = "block";
      if (tooltipText !== text) {
        tooltip.innerHTML = text;
        tooltipText = text;
        // Measure once when tooltip text changes rather than on every animation frame.
        tooltipWidth = tooltip.offsetWidth;
        tooltipHeight = tooltip.offsetHeight;
      }
      positionTooltip(x, y);
    } else {
      tooltip.style.display = "none";
    }
  };

  const syncHoverAt = (
    x: number,
    y: number,
    now: number,
    event?: MouseEvent,
    stationary = false,
  ) => {
    const point = pickAt(x, y, now);
    if (!point) {
      if (hovered) clearHover();
      return;
    }
    if (stationary && hovered?.key === point.key) {
      if (hovered !== point) {
        hovered = point;
        updateTooltipFor(point, x, y);
      }
      return;
    }
    if (hovered?.key !== point.key) {
      if (hovered) chart.trigger("mouseout", eventParams(hovered));
      hovered = point;
      chart.trigger("mouseover", eventParams(point, event));
      setZRenderCursor(chart, "pointer");
      updateTooltipFor(point, x, y);
      return;
    }
    hovered = point;
    setZRenderCursor(chart, "pointer");
    if (tooltip.style.display === "block") positionTooltip(x, y);
  };

  const move = (event: MouseEvent) => {
    // Do not show dot tooltips or hover highlights while box-zoom dragging.
    if ((event.buttons & 1) !== 0) {
      if (hovered) clearHover();
      pointerPos = null;
      return;
    }
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerPos = { x, y };
    syncHoverAt(x, y, performance.now(), event, false);
  };

  const onPointerDown = () => {
    if (hovered) clearHover();
    pointerPos = null;
  };

  const leave = () => {
    pointerPos = null;
    clearHover();
  };

  const click = (event: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const point = pickAt(x, y, performance.now());
    if (point) chart.trigger("click", eventParams(point, event));
  };

  const render = (now: number): boolean => {
    if (paused) return false;
    const ratio = window.devicePixelRatio || 1;
    const width = chart.getWidth();
    const height = chart.getHeight();
    if (width <= 0 || height <= 0) return false;

    if (maxPointSize * ratio + 1 > maxHardwarePointSize) {
      fallback();
      return false;
    }

    if (width !== canvasWidth || height !== canvasHeight || ratio !== canvasRatio) {
      canvasWidth = width;
      canvasHeight = height;
      canvasRatio = ratio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const plot = resolveGridRect(width, height);
    const radius = maxPointSize / 2 + 1;
    if (plot) {
      const sx0 = Math.max(0, Math.floor((plot.x - radius) * ratio));
      const sx1 = Math.min(canvas.width, Math.ceil((plot.x + plot.width + radius) * ratio));
      const sy0 = Math.max(0, Math.floor((height - plot.y - plot.height - radius) * ratio));
      const sy1 = Math.min(canvas.height, Math.ceil((height - plot.y + radius) * ratio));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(sx0, sy0, Math.max(0, sx1 - sx0), Math.max(0, sy1 - sy0));
    }

    gl.uniform2f(sizeUniform, width, height);
    const t = clampedProgress(started, duration, now);
    gl.uniform1f(progressUniform, t);
    gl.uniform1f(ratioUniform, ratio);
    gl.drawArrays(gl.POINTS, 0, points.length);

    if (pointerPos) syncHoverAt(pointerPos.x, pointerPos.y, now, undefined, true);
    return Boolean(duration && now - started < duration);
  };

  const loop = createFrameLoop(render);

  const update = (next: EChartsOption, animate = true) => {
    option = next;
    applyTooltipTheme(next);

    const idx = findScatterSeriesIndex(next);
    if (idx < 0) {
      clearHover();
      points = [];
      duration = 0;
      loop.start(true);
      return;
    }
    scatterSeriesIndex = idx;
    const series = seriesArray(next)[idx] as ScatterSeriesOption;
    const data = series.data as Datum[];

    // Layer WebGL dots above gridlines/reference lines (zlevel 0) and below sparse labels (zlevel 1).
    let labelsCanvas = findZLevelCanvas(chart, 1);
    if (!labelsCanvas) {
      refreshZRenderImmediately(chart);
      labelsCanvas = findZLevelCanvas(chart, 1);
    }
    if (
      labelsCanvas &&
      (canvas.parentNode !== labelsCanvas.parentNode || canvas.nextSibling !== labelsCanvas)
    ) {
      labelsCanvas.parentNode?.insertBefore(canvas, labelsCanvas);
    }

    const now = performance.now();
    const t = clampedProgress(started, duration, now);
    const previous = new Map<
      string,
      {
        x: number;
        y: number;
        alpha: number;
        size: number;
        fill: RGBA;
        border: RGBA;
        borderWidth: number;
      }
    >();
    for (const p of points) {
      const x = interpolate(p.fromX, p.toX, t);
      const y = interpolate(p.fromY, p.toY, t);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      previous.set(p.key, {
        x,
        y,
        alpha: interpolate(p.alpha, p.visible ? 1 : 0, t),
        size: interpolate(p.fromSize, p.toSize, t),
        fill: p.fill,
        border: p.border,
        borderWidth: p.borderWidth,
      });
    }

    // Fast path: resolve Cartesian2D axes once per update instead of calling convertToPixel per point.
    const coord = getCartesian2DCoord(chart, idx);
    gridRect = coord ? coord.master.getRect() : null;
    const xAxis = coord?.getAxis?.("x");
    const yAxis = coord?.getAxis?.("y");
    const toPixel =
      xAxis && yAxis
        ? (val: number[]): [number, number] => [
            xAxis.toGlobalCoord(xAxis.dataToCoord(val[0]!)),
            yAxis.toGlobalCoord(yAxis.dataToCoord(val[1]!)),
          ]
        : (val: number[]): [number, number] => {
            const p = chart.convertToPixel({ seriesIndex: idx }, val) as number[] | undefined;
            return [p?.[0] ?? NaN, p?.[1] ?? NaN];
          };

    const seriesOpacity = series.itemStyle?.opacity ?? 0.8;
    const seriesPaint =
      series.itemStyle?.color ?? (typeof series.color === "string" ? series.color : undefined);
    const seriesBorderColor = series.itemStyle?.borderColor;
    const seriesBorderWidth = series.itemStyle?.borderWidth ?? 0;
    const scratchParams = {
      componentType: "series",
      seriesType: "scatter",
      seriesIndex: scatterSeriesIndex,
      dataIndex: 0,
      data: null as unknown as Datum,
      name: undefined as string | undefined,
      value: [] as number[],
    };

    const nextIds = new Set<string>();
    const nextPoints: Point[] = [];
    for (let index = 0; index < data.length; index++) {
      const d = data[index]!;
      const val = datumValue(d);
      if (!Array.isArray(val) || val.length < 2) continue;
      const [toX, toY] = toPixel(val);
      if (!Number.isFinite(toX) || !Number.isFinite(toY)) continue;

      const k = datumKey(d, index);
      nextIds.add(k);
      const old = previous.get(k);
      const obj = isDatumObject(d) ? d : undefined;
      const rawSize =
        typeof obj?.symbolSize === "number"
          ? obj.symbolSize
          : typeof series.symbolSize === "function"
            ? series.symbolSize(val, { data: d, dataIndex: index } as never)
            : (series.symbolSize ?? 8);
      const pointSize = typeof rawSize === "number" ? Math.max(0, rawSize) : 8;

      const itemStyle = obj?.itemStyle;
      const opacity = itemStyle?.opacity ?? seriesOpacity;
      let resolvedFill: unknown = itemStyle?.color;
      if (resolvedFill === undefined) {
        if (typeof seriesPaint === "function") {
          scratchParams.dataIndex = index;
          scratchParams.data = d;
          scratchParams.name = obj?.name;
          scratchParams.value = val;
          resolvedFill = seriesPaint(scratchParams as never);
        } else {
          resolvedFill = seriesPaint;
        }
      }
      const parsedFill = parseColor(resolvedFill ?? obj?.color ?? "#1a9f99", DEFAULT_FILL);
      const fill: RGBA = [parsedFill[0], parsedFill[1], parsedFill[2], parsedFill[3] * opacity];
      const borderWidth = itemStyle?.borderWidth ?? seriesBorderWidth;
      const borderColor = itemStyle?.borderColor ?? seriesBorderColor;
      const border = borderWidth > 0 ? parseColor(borderColor, TRANSPARENT) : TRANSPARENT;

      nextPoints.push({
        key: k,
        data: d,
        index,
        fromX: old?.x ?? toX,
        fromY: old?.y ?? toY,
        toX,
        toY,
        alpha: old?.alpha ?? 0,
        fromSize: old?.size ?? pointSize,
        toSize: pointSize,
        fill,
        border,
        borderWidth,
        visible: true,
      });
    }

    for (const p of points) {
      if (!p.visible || nextIds.has(p.key)) continue;
      const prev = previous.get(p.key);
      if (!prev) continue;
      nextPoints.push({
        ...p,
        fromX: prev.x,
        fromY: prev.y,
        toX: prev.x,
        toY: prev.y,
        alpha: prev.alpha,
        fromSize: prev.size,
        toSize: prev.size,
        fill: prev.fill,
        border: prev.border,
        borderWidth: prev.borderWidth,
        visible: false,
      });
    }

    points = nextPoints;
    let maxSize = 0;
    const neededFloats = points.length * FLOATS_PER_POINT;
    if (neededFloats > vertexData.length) {
      vertexData = new Float32Array(Math.max(neededFloats, vertexData.length * 2));
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (p.fromSize > maxSize) maxSize = p.fromSize;
      if (p.toSize > maxSize) maxSize = p.toSize;

      const o = i * FLOATS_PER_POINT;
      vertexData[o] = p.fromX;
      vertexData[o + 1] = p.fromY;
      vertexData[o + 2] = p.toX;
      vertexData[o + 3] = p.toY;
      vertexData[o + 4] = p.fill[0];
      vertexData[o + 5] = p.fill[1];
      vertexData[o + 6] = p.fill[2];
      vertexData[o + 7] = p.fill[3];
      vertexData[o + 8] = p.border[0];
      vertexData[o + 9] = p.border[1];
      vertexData[o + 10] = p.border[2];
      vertexData[o + 11] = p.border[3];
      vertexData[o + 12] = p.alpha;
      vertexData[o + 13] = p.visible ? 1 : 0;
      vertexData[o + 14] = p.fromSize;
      vertexData[o + 15] = p.toSize;
      vertexData[o + 16] = p.borderWidth;
    }

    maxPointSize = maxSize;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (neededFloats > gpuBufferFloats) {
      gpuBufferFloats = vertexData.length;
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
    } else if (neededFloats > 0) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData.subarray(0, neededFloats));
    }

    duration =
      animate && next.animation !== false && !prefersReducedMotion() && previous.size
        ? typeof next.animationDurationUpdate === "number"
          ? next.animationDurationUpdate
          : CHART_UPDATE_DURATION
        : 0;
    started = performance.now();
    if (!pointerPos && hovered) clearHover();
    loop.start(true);
  };

  const zoom = () => {
    if (option) update(option, true);
  };

  const lost = (event: Event) => {
    event.preventDefault();
    fallback();
  };

  canvas.addEventListener("webglcontextlost", lost);
  container.addEventListener("mousemove", move);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("mouseleave", leave);
  container.addEventListener("click", click);
  chart.on("datazoom", zoom);

  return {
    update,
    resize: () => {
      if (option) update(option, false);
    },
    pause: () => {
      paused = true;
      loop.stop();
      leave();
    },
    resume: () => {
      paused = false;
      if (option) loop.start(true);
    },
    dispose: () => {
      loop.stop();
      leave();
      chart.off("datazoom", zoom);
      canvas.removeEventListener("webglcontextlost", lost);
      container.removeEventListener("mousemove", move);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("mouseleave", leave);
      container.removeEventListener("click", click);
      gl.deleteBuffer(buffer);
      shaders.forEach((shader) => gl.deleteShader(shader));
      gl.deleteProgram(program);
      if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
      tooltip.remove();
    },
  };
}

export function gpuScatterOption(option: EChartsOption): EChartsOption {
  const scatterIndex = findScatterSeriesIndex(option);
  if (scatterIndex < 0) return option;

  const allSeries = seriesArray(option);
  const scatter = allSeries[scatterIndex] as ScatterSeriesOption;
  const data = scatter.data as Datum[];
  const formatter = scatter.label?.formatter;

  const labeledData: Datum[] = [];
  const originalIndices: number[] = [];
  for (let dataIndex = 0; dataIndex < data.length; dataIndex++) {
    const item = data[dataIndex]!;
    const obj = isDatumObject(item) ? item : undefined;
    const itemShowsLabel = obj?.label?.show === true;
    const itemHidesLabel = obj?.label?.show === false;
    const included =
      itemShowsLabel ||
      Boolean(
        scatter.label?.show &&
        !itemHidesLabel &&
        (typeof formatter !== "function" || formatter({ data: item, dataIndex } as never)),
      );
    if (!included) continue;
    originalIndices.push(dataIndex);
    // Strip datum-level opacity/border so ECharts draws only the sparse label + leader line, not duplicate dots.
    labeledData.push(
      obj ? { ...obj, itemStyle: { ...obj.itemStyle, opacity: 0, borderWidth: 0 } } : item,
    );
  }

  const remappedFormatter =
    typeof formatter === "function"
      ? (params: Record<string, unknown>) => {
          const idx =
            typeof params.dataIndex === "number" ? originalIndices[params.dataIndex] : undefined;
          return formatter({ ...params, dataIndex: idx ?? params.dataIndex } as never);
        }
      : formatter;

  const rawLabelLayout = scatter.labelLayout;
  const remappedLabelLayout =
    typeof rawLabelLayout === "function"
      ? (params: Record<string, unknown>) => {
          const idx =
            typeof params.dataIndex === "number" ? originalIndices[params.dataIndex] : undefined;
          return rawLabelLayout({ ...params, dataIndex: idx ?? params.dataIndex } as never);
        }
      : rawLabelLayout;

  const rawSymbolSize = scatter.symbolSize;
  const remappedSymbolSize =
    typeof rawSymbolSize === "function"
      ? (val: unknown, params: Record<string, unknown>) => {
          const idx =
            typeof params.dataIndex === "number" ? originalIndices[params.dataIndex] : undefined;
          return rawSymbolSize(
            val as never,
            { ...params, dataIndex: idx ?? params.dataIndex } as never,
          );
        }
      : rawSymbolSize;

  const hiddenScatter: ScatterSeriesOption = {
    ...scatter,
    // Retain dense data for axes, zoom, and convertToPixel without creating Canvas symbols.
    symbol: "none",
    silent: true,
    label: { show: false },
    animation: false,
  };

  const labelSeries: ScatterSeriesOption = {
    ...scatter,
    id: `${scatter.id ?? `scatter-${scatterIndex}`}/labels`,
    zlevel: 1,
    animationDuration: 0,
    data: labeledData,
    silent: true,
    symbolSize: remappedSymbolSize as ScatterSeriesOption["symbolSize"],
    itemStyle: { ...scatter.itemStyle, opacity: 0, borderWidth: 0 },
    label: {
      ...scatter.label,
      ...(remappedFormatter !== undefined ? { formatter: remappedFormatter as never } : {}),
      opacity: 1,
    },
    ...(remappedLabelLayout !== undefined ? { labelLayout: remappedLabelLayout as never } : {}),
  };

  const nextSeries = allSeries.slice();
  nextSeries[scatterIndex] = hiddenScatter;
  nextSeries.push(labelSeries);

  return {
    ...option,
    series: nextSeries,
  };
}
