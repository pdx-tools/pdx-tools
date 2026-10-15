import { CHART_UPDATE_DURATION, easeChartUpdate, interpolate } from "./chartMotion";
import * as echarts from "echarts/core";
import type { EChartsOption } from "./EChart";

type Datum = { id?: string | number; tag?: string; name?: string; value: number[]; color?: string };
type Point = {
  data: Datum;
  index: number;
  from: number[];
  to: number[];
  alpha: number;
  fromSize: number;
  toSize: number;
  visible: boolean;
};

const key = (d: Datum) => String(d.id ?? d.tag ?? d.name);

// ECharts retains axes, zoom and sparse labels. Only the dense point layer uses WebGL.
export function createGpuScatter(chart: echarts.ECharts, fallback: () => void) {
  const container = chart.getDom() as HTMLDivElement;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  });
  if (!gl) return;
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
      attribute vec2 aFrom; attribute vec2 aTo; attribute vec4 aColor;
      attribute vec2 aAlpha; attribute vec2 aSize;
      uniform vec2 uSize; uniform float uProgress; uniform mediump float uRatio;
      varying vec4 vColor; varying mediump float vPointSize;
      void main() {
        vec2 p = mix(aFrom, aTo, uProgress) / uSize;
        gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
        float pointSize = mix(aSize.x, aSize.y, uProgress);
        vPointSize = pointSize * uRatio + 1.0;
        gl_PointSize = vPointSize;
        vColor = vec4(aColor.rgb, aColor.a * mix(aAlpha.x, aAlpha.y, uProgress) * step(0.0001, pointSize));
      }`,
    );
    compile(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float; varying vec4 vColor; varying mediump float vPointSize; void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float alpha = clamp((0.5 - radius) * vPointSize, 0.0, 1.0);
        gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
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
  // Insert below the Canvas chart so its labels and controls remain on top.
  container.insertBefore(canvas, container.firstChild);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [name, size, offset] of [
    ["aFrom", 2, 0],
    ["aTo", 2, 2],
    ["aColor", 4, 4],
    ["aAlpha", 2, 8],
    ["aSize", 2, 10],
  ] as const) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 48, offset * 4);
  }
  const sizeUniform = gl.getUniformLocation(program, "uSize");
  const progressUniform = gl.getUniformLocation(program, "uProgress");
  const ratioUniform = gl.getUniformLocation(program, "uRatio");
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  let points: Point[] = [];
  let started = 0;
  let duration = 0;
  let maxPointSize = 8;
  let raf = 0;
  let paused = false;
  let option: EChartsOption;
  let hovered: Point | undefined;
  let pointer: MouseEvent | undefined;
  let tooltipText: string | undefined;
  const progress = () =>
    duration ? easeChartUpdate(Math.min(1, (performance.now() - started) / duration)) : 1;
  const position = (point: Point, t: number) =>
    point.from.map((v, i) => interpolate(v, point.to[i], t));
  const eventParams = (point: Point, event?: MouseEvent) =>
    ({
      componentType: "series",
      seriesType: "scatter",
      seriesIndex: 0,
      dataIndex: point.index,
      data: point.data,
      name: point.data.name,
      value: point.data.value,
      ...(event ? { event: { event } } : {}),
    }) as unknown as echarts.ECElementEvent;
  const tooltip = document.createElement("div");
  tooltip.style.cssText =
    "display:none;position:absolute;z-index:100;pointer-events:none;border-radius:3px;padding:6px 10px;white-space:nowrap";
  container.appendChild(tooltip);
  const clearHover = () => {
    if (hovered) chart.trigger("mouseout", eventParams(hovered));
    hovered = undefined;
    tooltip.style.display = "none";
    container.style.cursor = "";
  };
  const pick = (event: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    if (!chart.containPixel({ gridIndex: 0 }, [x, y])) return;
    const t = progress();
    // WebGL paints later points on top, so hit testing follows that order.
    for (let i = points.length - 1; i >= 0; i--) {
      const point = points[i];
      if (!point.visible || interpolate(point.alpha, 1, t) < 0.01) continue;
      const px = interpolate(point.from[0], point.to[0], t);
      const py = interpolate(point.from[1], point.to[1], t);
      const size = interpolate(point.fromSize, point.toSize, t);
      if (size <= 0) continue;
      const radius = size / 2 + 2;
      if ((px - x) ** 2 + (py - y) ** 2 <= radius * radius) return point;
    }
  };
  const move = (event: MouseEvent, stationary = false) => {
    pointer = event;
    const point = pick(event);
    if (!point) {
      clearHover();
      return;
    }
    if (stationary && hovered === point) return;
    if (hovered !== point) {
      clearHover();
      hovered = point;
      chart.trigger("mouseover", eventParams(point, event));
    }
    container.style.cursor = "pointer";
    const settings = Array.isArray(option.tooltip) ? option.tooltip[0] : option.tooltip;
    const formatter = settings?.formatter;
    if (typeof formatter !== "function") return;
    const text = formatter(eventParams(point) as never, "gpu", () => {});
    if (typeof text !== "string") return;
    if (tooltipText !== text) {
      tooltip.innerHTML = text;
      tooltipText = text;
    }
    Object.assign(tooltip.style, {
      background: settings?.backgroundColor ?? "rgba(8,11,16,.9)",
      color: settings?.textStyle?.color ?? "#f2eade",
      fontSize: `${settings?.textStyle?.fontSize ?? 11}px`,
      fontFamily: settings?.textStyle?.fontFamily ?? "sans-serif",
      border: `1px solid ${settings?.borderColor ?? "rgba(255,255,255,.1)"}`,
      display: "block",
    });
    const rect = container.getBoundingClientRect();
    tooltip.style.left = `${Math.max(0, Math.min(event.clientX - rect.left + 12, chart.getWidth() - tooltip.offsetWidth - 4))}px`;
    tooltip.style.top = `${Math.max(0, Math.min(event.clientY - rect.top + 12, chart.getHeight() - tooltip.offsetHeight - 4))}px`;
  };
  const leave = () => {
    pointer = undefined;
    clearHover();
  };
  const click = (event: MouseEvent) => {
    const point = pick(event);
    if (point) chart.trigger("click", eventParams(point, event));
  };
  const draw = () => {
    cancelAnimationFrame(raf);
    if (paused) return;
    const ratio = window.devicePixelRatio || 1;
    const width = chart.getWidth(),
      height = chart.getHeight();
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Grid corners follow zoom and resize without depending on ECharts internals.
    const grid = Array.isArray(option.grid) ? option.grid[0] : option.grid;
    const radius = maxPointSize / 2 + 1;
    if (
      grid &&
      typeof grid.left === "number" &&
      typeof grid.right === "number" &&
      typeof grid.top === "number" &&
      typeof grid.bottom === "number"
    ) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        (grid.left - radius) * ratio,
        (grid.bottom - radius) * ratio,
        Math.max(0, (width - grid.left - grid.right + radius * 2) * ratio),
        Math.max(0, (height - grid.top - grid.bottom + radius * 2) * ratio),
      );
    }
    gl.uniform2f(sizeUniform, width, height);
    const t = progress();
    gl.uniform1f(progressUniform, t);
    gl.uniform1f(ratioUniform, ratio);
    gl.drawArrays(gl.POINTS, 0, points.length);
    if (pointer) move(pointer, true);
    if (t < 1) raf = requestAnimationFrame(draw);
  };
  const update = (next: EChartsOption, animate = true) => {
    clearHover();
    option = next;
    const series = Array.isArray(next.series) ? next.series[0] : next.series;
    if (!series || series.type !== "scatter" || !Array.isArray(series.data)) return;
    const data = series.data as Datum[];
    const t = progress();
    const previous = new Map(
      points.map((p) => [
        key(p.data),
        {
          position: position(p, t),
          alpha: interpolate(p.alpha, p.visible ? 1 : 0, t),
          size: interpolate(p.fromSize, p.toSize, t),
        },
      ]),
    );
    const ids = new Set(data.map(key));
    const exiting = points.filter((p) => p.visible && !ids.has(key(p.data)));
    points = [
      ...data.map((d, index) => {
        const to = chart.convertToPixel({ seriesIndex: 0 }, d.value) as number[];
        const old = previous.get(key(d));
        const size =
          typeof series.symbolSize === "function"
            ? series.symbolSize(d.value, { data: d, dataIndex: index } as never)
            : (series.symbolSize ?? 8);
        const pointSize = typeof size === "number" ? Math.max(0, size) : 8;
        return {
          data: d,
          index,
          from: old?.position ?? to,
          to,
          alpha: old?.alpha ?? 0,
          fromSize: old?.size ?? pointSize,
          toSize: pointSize,
          visible: true,
        };
      }),
      ...exiting.map((p) => ({
        ...p,
        from: previous.get(key(p.data))!.position,
        to: previous.get(key(p.data))!.position,
        alpha: previous.get(key(p.data))!.alpha,
        fromSize: previous.get(key(p.data))!.size,
        toSize: previous.get(key(p.data))!.size,
        visible: false,
      })),
    ];
    maxPointSize = points.reduce((max, p) => Math.max(max, p.fromSize, p.toSize), 0);
    const vertices = new Float32Array(points.length * 12);
    const opacity = series.itemStyle?.opacity ?? 0.8;
    points.forEach((p, i) => {
      const paint =
        series.itemStyle?.color ?? (typeof series.color === "string" ? series.color : undefined);
      const resolved =
        typeof paint === "function"
          ? paint(eventParams(p) as never)
          : (paint ?? p.data.color ?? "#1a9f99");
      const color = echarts.color.parse(typeof resolved === "string" ? resolved : "#1a9f99") ?? [
        26, 159, 153, 1,
      ];
      vertices.set(
        [
          ...p.from,
          ...p.to,
          color[0] / 255,
          color[1] / 255,
          color[2] / 255,
          color[3] * opacity,
          p.alpha,
          p.visible ? 1 : 0,
          p.fromSize,
          p.toSize,
        ],
        i * 12,
      );
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    duration =
      animate && next.animation !== false && previous.size
        ? typeof next.animationDurationUpdate === "number"
          ? next.animationDurationUpdate
          : CHART_UPDATE_DURATION
        : 0;
    started = performance.now();
    draw();
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
      cancelAnimationFrame(raf);
      leave();
    },
    resume: () => {
      paused = false;
      if (option) draw();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      leave();
      chart.off("datazoom", zoom);
      canvas.removeEventListener("webglcontextlost", lost);
      container.removeEventListener("mousemove", move);
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
  const series = Array.isArray(option.series) ? option.series[0] : option.series;
  if (!series || series.type !== "scatter" || !Array.isArray(series.data)) return option;
  const formatter = series.label?.formatter;
  const labels =
    series.label?.show && typeof formatter === "function"
      ? series.data.filter((data, dataIndex) => formatter({ data, dataIndex } as never))
      : [];
  return {
    ...option,
    series: [
      // Retain dense data for axes and zoom without creating a second set of
      // zero-size Canvas symbols for points already painted by WebGL.
      { ...series, symbol: "none", silent: true, label: { show: false }, animation: false },
      {
        ...series,
        id: `${series.id}/labels`,
        data: labels,
        silent: true,
        symbolSize: series.symbolSize,
        itemStyle: { ...series.itemStyle, opacity: 0 },
        label: {
          ...series.label,
          opacity: 1,
        },
      },
    ],
  };
}
