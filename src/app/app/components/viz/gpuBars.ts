import { CHART_UPDATE_DURATION, easeChartUpdate, interpolate } from "./chartMotion";
import * as echarts from "echarts/core";
type Rect = InstanceType<typeof echarts.graphic.Rect>;
type GlobalModel = { eachSeries(callback: (series: echarts.SeriesModel) => void): void };
type Cartesian2D = echarts.SeriesModel["coordinateSystem"] & {
  master: { getRect(): { x: number; y: number; width: number; height: number } };
  getBaseAxis(): echarts.Axis;
  getOtherAxis(axis: echarts.Axis): echarts.Axis & { toGlobalCoord(value: number): number };
};
import type { EChartsOption } from "./EChart";

type Box = [number, number, number, number];
type Bar = {
  key: string;
  from: Box;
  to: Box;
  base: Box;
  clip: Box;
  fill: number[];
  stroke: number[];
  radius: number[];
  border: number;
  fromAlpha: number;
  toAlpha: number;
  params: echarts.ECElementEvent;
  focusSeries: boolean;
  silent: boolean;
};
const position = (bar: Bar, t: number) =>
  bar.from.map((v, i) => interpolate(v, bar.to[i], t)) as Box;
const color = (value: unknown, opacity = 1) => {
  if (value == null || value === "none") return [0, 0, 0, 0];
  if (typeof value !== "string") throw new Error("Unsupported bar paint");
  const rgba = echarts.color.parse(value);
  if (!rgba) throw new Error("Unsupported bar color");
  return [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] * opacity];
};

/** Cartesian rect bars only; mixed/polar/large charts retain their regular renderer. */
export function supportsGpuBars(option: EChartsOption) {
  const series = Array.isArray(option.series) ? option.series : [option.series];
  return (
    series.length > 0 &&
    series.every(
      (s) =>
        s?.type === "bar" &&
        (!s.coordinateSystem || s.coordinateSystem === "cartesian2d") &&
        !s.large &&
        !s.realtimeSort &&
        !s.zlevel &&
        s.clip !== false &&
        s.animation !== false &&
        !s.universalTransition,
    )
  );
}
export function gpuBarOption(option: EChartsOption): EChartsOption {
  const series = Array.isArray(option.series) ? option.series : [option.series];
  return { ...option, series: series.map((s) => ({ ...s, zlevel: 1 })) } as EChartsOption;
}

/** ECharts computes grouping, stacking, zoom and styles; WebGL animates its final rects. */
export function createGpuBars(chart: echarts.ECharts, fallback: () => void) {
  const container = chart.getDom();
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return;
  const program = gl.createProgram();
  if (!program) return;
  const shaders: WebGLShader[] = [];
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Cannot create bar shader");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error("Cannot compile bar shader");
    gl.attachShader(program, shader);
  };
  try {
    compile(
      gl.VERTEX_SHADER,
      `
      attribute vec2 aCorner; attribute vec4 aFrom; attribute vec4 aTo;
      attribute vec4 aFill; attribute vec4 aStroke; attribute vec4 aRadius;
      attribute vec3 aParams; attribute vec2 aIndex;
      uniform vec2 uSize; uniform float uProgress; uniform float uHovered; uniform float uFocus;
      varying vec2 vLocal; varying vec2 vSize; varying vec4 vFill; varying vec4 vStroke;
      varying vec4 vRadius; varying float vBorder;
      void main() {
        vec4 rect = mix(aFrom, aTo, uProgress);
        vBorder = aParams.x;
        vSize = rect.zw + vec2(vBorder);
        vLocal = aCorner * vSize;
        vec2 p = (rect.xy - vec2(vBorder * .5) + vLocal) / uSize;
        gl_Position = vec4(p.x * 2. - 1., 1. - p.y * 2., 0., 1.);
        float alpha = mix(aParams.y, aParams.z, uProgress);
        if (uFocus >= 0. && aIndex.y != uFocus) alpha *= .1;
        vFill = vec4(aFill.rgb, aFill.a * alpha);
        if (aIndex.x == uHovered) vFill.rgb = mix(vFill.rgb, vec3(1.), .1);
        vStroke = vec4(aStroke.rgb, aStroke.a * alpha); vRadius = aRadius;
      }`,
    );
    compile(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      varying vec2 vLocal; varying vec2 vSize; varying vec4 vFill; varying vec4 vStroke;
      varying vec4 vRadius; varying float vBorder;
      void main() {
        vec2 halfSize = vSize * .5;
        vec2 p = vLocal - halfSize;
        float radius = p.y < 0. ? (p.x < 0. ? vRadius.x : vRadius.y) : (p.x < 0. ? vRadius.w : vRadius.z);
        radius = min(radius + vBorder * .5, min(halfSize.x, halfSize.y));
        vec2 q = abs(p) - halfSize + vec2(radius);
        float d = min(max(q.x,q.y),0.) + length(max(q,0.)) - radius;
        float coverage = clamp(.5 - d, 0., 1.);
        vec4 c = vBorder > 0. && d > -vBorder ? vStroke : vFill;
        gl_FragColor = vec4(c.rgb, c.a * coverage);
      }`,
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Cannot link bar shader");
  } catch {
    shaders.forEach((s) => gl.deleteShader(s));
    gl.deleteProgram(program);
    return;
  }
  const buffer = gl.createBuffer();
  if (!buffer) {
    shaders.forEach((s) => gl.deleteShader(s));
    gl.deleteProgram(program);
    return;
  }
  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  canvas.dataset.renderer = "gpu-bars";
  canvas.style.cssText = "position:absolute;inset:0;pointer-events:none";
  container.insertBefore(canvas, container.firstChild);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  let offset = 0;
  const stride = 27;
  for (const [name, size] of [
    ["aCorner", 2],
    ["aFrom", 4],
    ["aTo", 4],
    ["aFill", 4],
    ["aStroke", 4],
    ["aRadius", 4],
    ["aParams", 3],
    ["aIndex", 2],
  ] as const) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride * 4, offset * 4);
    offset += size;
  }
  const sizeUniform = gl.getUniformLocation(program, "uSize");
  const progressUniform = gl.getUniformLocation(program, "uProgress");
  const hoverUniform = gl.getUniformLocation(program, "uHovered");
  const focusUniform = gl.getUniformLocation(program, "uFocus");
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  let bars: Bar[] = [],
    batches: { clip: Box; start: number; count: number }[] = [];
  const hidden = new Map<Rect, { invisible: boolean; silent: boolean }>();
  let option: EChartsOption,
    started = 0,
    duration = 0,
    raf = 0,
    paused = false;
  let hovered: Bar | undefined;
  const progress = () =>
    duration ? easeChartUpdate(Math.min(1, (performance.now() - started) / duration)) : 1;
  const params = (bar: Bar, event?: MouseEvent) =>
    ({ ...bar.params, ...(event ? { event: { event } } : {}) }) as echarts.ECElementEvent;
  const clearHover = () => {
    if (hovered) chart.trigger("mouseout", params(hovered));
    hovered = undefined;
    container.style.cursor = "";
  };
  const restore = () => {
    for (const [element, { invisible, silent }] of hidden) {
      element.invisible = invisible;
      element.silent = silent;
      element.markRedraw();
    }
  };
  const draw = () => {
    cancelAnimationFrame(raf);
    if (paused) return;
    const ratio = window.devicePixelRatio || 1,
      width = chart.getWidth(),
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
    gl.useProgram(program);
    gl.uniform2f(sizeUniform, width, height);
    gl.uniform1f(progressUniform, progress());
    gl.uniform1f(hoverUniform, hovered ? bars.indexOf(hovered) : -1);
    gl.uniform1f(focusUniform, hovered?.focusSeries ? (hovered.params.seriesIndex ?? -1) : -1);
    gl.enable(gl.SCISSOR_TEST);
    for (const batch of batches) {
      const [x, y, w, h] = batch.clip;
      gl.scissor(
        Math.max(0, Math.floor(x * ratio)),
        Math.max(0, Math.floor((height - y - h) * ratio)),
        Math.max(0, Math.ceil(w * ratio)),
        Math.max(0, Math.ceil(h * ratio)),
      );
      gl.drawArrays(gl.TRIANGLES, batch.start, batch.count);
    }
    if (duration && performance.now() - started < duration) raf = requestAnimationFrame(draw);
  };
  const update = (next: EChartsOption, animate = true) => {
    const first = !option;
    option = next;
    const t = progress(),
      old = new Map(
        bars.map((b) => [
          b.key,
          { ...b, from: position(b, t), fromAlpha: interpolate(b.fromAlpha, b.toAlpha, t) },
        ]),
      );
    restore();
    clearHover();
    const collected: Bar[] = [],
      elements: Rect[] = [];
    try {
      // This version-pinned adapter reads ECharts' computed rects rather than reimplementing its layout.
      const model = (chart as unknown as { getModel(): GlobalModel }).getModel();
      model.eachSeries((series) => {
        if (series.subType !== "bar" || series.coordinateSystem?.type !== "cartesian2d")
          throw new Error("Unsupported bar layout");
        const coord = series.coordinateSystem as Cartesian2D;
        const grid = coord.master.getRect();
        const clip: Box = [grid.x, grid.y, grid.width, grid.height];
        const horizontal = coord.getBaseAxis().dim === "y",
          data = series.getData();
        for (let i = 0; i < data.count(); i++) {
          const element = data.getItemGraphicEl(i) as Rect | undefined;
          if (!element || element.ignore) continue;
          if (element.type !== "rect" || element.style.shadowBlur || element.style.lineDash)
            throw new Error("Unsupported bar shape");
          const s = { ...element.shape },
            style = element.style;
          // Retain ECharts' host animations for attached labels; only bar paint is
          // replaced. The shader receives their destination, not the current frame.
          for (const animator of element.animators) {
            if (animator.targetName !== "shape") continue;
            for (const track of animator.getTracks()) {
              const value = track.keyframes.at(-1)?.rawValue;
              if (typeof value === "number" && track.propName in s)
                Object.assign(s, { [track.propName]: value });
            }
          }
          const label = element.getTextContent();
          if (!label || label.ignore || !label.style.text) {
            // No attached label needs the CPU-side geometry animation. The GPU
            // already interpolates the destination rect; leave this host static.
            for (const animator of element.animators.slice())
              if (animator.targetName === "shape") animator.stop(true);
          }
          if (![s.x, s.y, s.width, s.height].every(Number.isFinite)) continue;
          const box: Box = [
            Math.min(s.x, s.x + s.width),
            Math.min(s.y, s.y + s.height),
            Math.abs(s.width),
            Math.abs(s.height),
          ];
          const valueAxis = coord.getOtherAxis(coord.getBaseAxis()) as echarts.Axis & {
            toGlobalCoord(value: number): number;
          };
          const zero = valueAxis.toGlobalCoord(valueAxis.dataToCoord(0));
          const baseline = Number.isFinite(zero) ? zero : horizontal ? s.x : s.y;
          const base: Box = horizontal
            ? [baseline, box[1], 0, box[3]]
            : [box[0], baseline, box[2], 0];
          const key = `${series.id}/${data.getId(i)}`,
            previous = old.get(key);
          old.delete(key);
          const radii = Array.isArray(s.r) ? s.r : [s.r ?? 0];
          const radius = [
            radii[0],
            radii[1] ?? radii[0],
            radii[2] ?? radii[0],
            radii[3] ?? radii[1] ?? radii[0],
          ];
          collected.push({
            key,
            from: previous?.from ?? base,
            to: box,
            base,
            clip,
            fill: color(style.fill, style.opacity),
            stroke: color(style.stroke, style.opacity),
            radius,
            border: style.stroke ? (style.lineWidth ?? 0) : 0,
            fromAlpha: previous?.fromAlpha ?? 0,
            toAlpha: 1,
            params: series.getDataParams(i) as unknown as echarts.ECElementEvent,
            focusSeries: series.get(["emphasis", "focus"]) === "series",
            silent: series.get("silent") === true,
          });
          elements.push(element);
        }
      });
    } catch {
      fallback();
      return;
    }
    for (const bar of old.values()) collected.push({ ...bar, to: bar.base, toAlpha: 0 });
    // Group by grid for a single draw call per clipping rectangle.
    collected.sort((a, b) => a.clip.join(",").localeCompare(b.clip.join(",")));
    bars = collected;
    batches = [];
    const vertices: number[] = [];
    bars.forEach((bar, index) => {
      const start = vertices.length / stride,
        last = batches.at(-1);
      if (last && last.clip.every((v, i) => v === bar.clip[i])) last.count += 6;
      else batches.push({ clip: bar.clip, start, count: 6 });
      for (const corner of [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 1],
        [1, 0],
        [1, 1],
      ])
        vertices.push(
          ...corner,
          ...bar.from,
          ...bar.to,
          ...bar.fill,
          ...bar.stroke,
          ...bar.radius,
          bar.border,
          bar.fromAlpha,
          bar.toAlpha,
          index,
          bar.params.seriesIndex ?? 0,
        );
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    for (const element of hidden.keys()) if (!element.parent) hidden.delete(element);
    for (const element of elements) {
      if (!hidden.has(element))
        hidden.set(element, { invisible: element.invisible, silent: element.silent });
    }
    // Removed data can retain a fading host briefly; keep its bar paint hidden too.
    for (const element of hidden.keys()) {
      element.invisible = true;
      element.silent = true;
      element.markRedraw();
    }
    chart.getZr().refreshImmediately();
    // Keep grid lines below the bars and ECharts labels/marks above them.
    const viewport = chart.getZr().painter.getViewportRoot();
    const labels = viewport.querySelector('canvas[data-zr-dom-id^="zr_1."]');
    if (labels) viewport.insertBefore(canvas, labels);
    started = performance.now();
    duration =
      animate && next.animation !== false
        ? first
          ? typeof next.animationDuration === "number"
            ? next.animationDuration
            : 1000
          : typeof next.animationDurationUpdate === "number"
            ? next.animationDurationUpdate
            : CHART_UPDATE_DURATION
        : 0;
    draw();
  };
  const pick = (event: MouseEvent) => {
    const rect = container.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top,
      t = progress();
    return bars.findLast((b) => {
      if (b.silent || !b.toAlpha) return false;
      const [cx, cy, cw, ch] = b.clip,
        [bx, by, bw, bh] = position(b, t);
      return (
        x >= cx &&
        x <= cx + cw &&
        y >= cy &&
        y <= cy + ch &&
        x >= bx &&
        x <= bx + bw &&
        y >= by &&
        y <= by + bh
      );
    });
  };
  const move = (event: MouseEvent) => {
    const bar = pick(event);
    if (bar === hovered) return;
    clearHover();
    hovered = bar;
    if (bar) {
      container.style.cursor = "pointer";
      chart.trigger("mouseover", params(bar, event));
      const settings = Array.isArray(option.tooltip) ? option.tooltip[0] : option.tooltip;
      if (settings?.trigger !== "axis")
        chart.dispatchAction({
          type: "showTip",
          seriesIndex: bar.params.seriesIndex ?? 0,
          dataIndex: bar.params.dataIndex,
        });
    }
    draw();
  };
  const leave = () => {
    clearHover();
    chart.dispatchAction({ type: "hideTip" });
    draw();
  };
  const click = (event: MouseEvent) => {
    const bar = pick(event);
    if (bar) chart.trigger("click", params(bar, event));
  };
  const refresh = () => {
    if (option) update(option, false);
  };
  const lost = (event: Event) => {
    event.preventDefault();
    fallback();
  };
  canvas.addEventListener("webglcontextlost", lost);
  container.addEventListener("mousemove", move);
  container.addEventListener("mouseleave", leave);
  container.addEventListener("click", click);
  chart.on("datazoom", refresh);
  chart.on("legendselectchanged", refresh);
  return {
    restore,
    update,
    resize: refresh,
    pause: () => {
      paused = true;
      cancelAnimationFrame(raf);
      clearHover();
    },
    resume: () => {
      paused = false;
      if (option) draw();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      clearHover();
      restore();
      hidden.clear();
      chart.off("datazoom", refresh);
      chart.off("legendselectchanged", refresh);
      canvas.removeEventListener("webglcontextlost", lost);
      container.removeEventListener("mousemove", move);
      container.removeEventListener("mouseleave", leave);
      container.removeEventListener("click", click);
      gl.deleteBuffer(buffer);
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
      if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
