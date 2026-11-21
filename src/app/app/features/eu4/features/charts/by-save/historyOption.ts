import type { LineSeriesOption, ScatterSeriesOption } from "echarts/charts";
import type { VisualMapComponentOption } from "echarts/components";
import type { EChartsOption } from "@/components/viz/EChart";
import type { ValueScale } from "./history";

/**
 * The lines of the history chart as an ECharts option: one line for each
 * country on one value scale, a dot at each save, the selected time as a
 * rule with what follows it faded. Marks, leaders, gap sticks and the hover
 * are drawn over the chart from the same plot mapping (see `plotMap`).
 *
 * The series keep one order and one count whatever is selected or pinned,
 * and pointing at a country only highlights and blurs series, so the option
 * is rebuilt only when the selection, the pins or the data change. The
 * strengths follow the prototype (`candidates/D5/app.js`, `D7/app.js`).
 */

export type Palette = {
  ground: string;
  ink: string;
  muted: string;
  faint: string;
  grid: string;
  base: string;
  rule: string;
  hoverRule: string;
  /** A line that is not in color. */
  field: string;
  /** The world total, which is no country. */
  accent: string;
  /** Keyboard focus. */
  ring: string;
};

export const palettes: Record<"light" | "dark", Palette> = {
  light: {
    ground: "#ffffff",
    ink: "#0b1220",
    muted: "#4b5563",
    faint: "#6b7280",
    grid: "#e5e7eb",
    base: "#9ca3af",
    rule: "#0b1220",
    hoverRule: "#9ca3af",
    field: "#9ca3af",
    accent: "#0284c7",
    ring: "#0284c7",
  },
  dark: {
    ground: "#0f172a",
    ink: "#e2e8f0",
    muted: "#b6bfcc",
    faint: "#94a3b8",
    grid: "#26324a",
    base: "#64748b",
    rule: "#f1f5f9",
    hoverRule: "#64748b",
    field: "#64748b",
    accent: "#38bdf8",
    ring: "#38bdf8",
  },
};

/** How a line stands: followed, compared (pinned or pointed), plain, or out of color. */
export type LineRole = "subject" | "compared" | "plain" | "grey";

export type ChartLine = {
  key: string;
  /** The value at each column, or null. */
  values: readonly (number | null)[];
  /** The color of the tag held at each column with a value. */
  colors: readonly (string | null)[];
  /** The name of the tag held at each column with a value. */
  names: readonly (string | null)[];
  /** The tag held at each column with a value, for its flag. */
  tags: readonly (string | null)[];
  /** Days where the line changes tag, with the color after. */
  changes: readonly { day: number; color: string }[];
  /** The role that the selection and pins give it; pointing is drawn as a highlight. */
  role: LineRole;
  /** A pinned country is compared, and this one steps back. */
  back: boolean;
};

export type Comparison = {
  subject: ChartLine;
  rival: ChartLine;
  /** The column where the present order began, to ring. */
  since: number | null;
};

/** Where days and values stand on the plot, in pixels from the chart's top left. */
export type PlotMap = {
  left: number;
  top: number;
  width: number;
  height: number;
  from: number;
  to: number;
  lo: number;
  hi: number;
  /** The step between the scale's round values. */
  step: number;
  x: (day: number) => number;
  y: (value: number) => number;
};

/**
 * The plot mapping that the option and everything drawn over it share: the
 * option sets the grid and axis bounds from these numbers, so a point at a
 * mapped pixel is where ECharts draws it.
 */
export function plotMap(
  grid: { left: number; top: number; width: number; height: number },
  view: readonly [number, number],
  scale: ValueScale,
): PlotMap {
  const span = Math.max(1, view[1] - view[0]);
  const range = scale.hi - scale.lo || 1;
  return {
    ...grid,
    from: view[0],
    to: view[1],
    lo: scale.lo,
    hi: scale.hi,
    step: scale.ticks.length > 1 ? scale.ticks[1] - scale.ticks[0] : range,
    x: (day) => grid.left + ((day - view[0]) / span) * grid.width,
    y: (value) => grid.top + grid.height * (1 - (value - scale.lo) / range),
  };
}

export type Strength = {
  width: number;
  join: number;
  dot: number;
  radius: number;
  future: number;
};

export type StrengthContext = {
  sparse: boolean;
  noisy: boolean;
  crowded: boolean;
  /** Pixels between saves in view. */
  pitch: number;
  /** A country is followed; without one, nobody leads. */
  anySubject: boolean;
  /** Above twelve lines, rivals keep dots only where saves stand well apart. */
  many?: boolean;
  world: boolean;
};

/**
 * Line width, join and dot opacity, dot radius and the opacity after the
 * selected save, from the prototypes: D5 for dense saves, D7 for sparse.
 */
export function strength(role: LineRole, back: boolean, c: StrengthContext): Strength {
  const lead = role === "subject" || role === "compared" || c.world;
  const grey = role === "grey";
  const future = (lead ? 0.34 : grey ? 0.28 : 0.25) * (back ? 0.6 : 1);
  if (c.sparse && !c.world) {
    return {
      width:
        role === "subject" ? 2.25 : role === "compared" ? 1.75 : grey ? 1 : c.anySubject ? 1 : 1.5,
      join: lead ? 1 : grey ? (back ? 0.35 : 0.7) : back ? 0.18 : c.anySubject ? 0.5 : 0.75,
      dot: lead ? 1 : grey ? (back ? 0.25 : 0.45) : back ? 0.3 : 1,
      radius:
        role === "subject" ? 4.6 : role === "compared" ? 4 : grey ? (c.pitch >= 4 ? 1 : 0) : 3.4,
      future,
    };
  }
  const free = !c.anySubject && !lead && !grey;
  return {
    width: c.world
      ? 2
      : role === "subject"
        ? 2.75
        : role === "compared"
          ? 2
          : grey || c.noisy
            ? 1
            : c.crowded
              ? 1.25
              : 1.5,
    join: lead
      ? 1
      : grey
        ? back
          ? 0.35
          : 0.7
        : back
          ? 0.22
          : c.noisy
            ? 0.38
            : free
              ? c.crowded
                ? 0.7
                : 0.85
              : c.crowded
                ? 0.55
                : 0.72,
    dot: lead
      ? 1
      : grey
        ? back
          ? 0.25
          : 0.45
        : back
          ? 0.25
          : c.noisy
            ? 0.85
            : c.crowded
              ? 0.6
              : 0.75,
    radius: c.world
      ? 2.6
      : c.many && (role === "plain" || role === "grey") && c.pitch < 8
        ? 0
        : grey
          ? c.pitch >= 5.5
            ? 1.5
            : c.pitch >= 4
              ? 1
              : 0
          : role === "subject"
            ? c.pitch >= 5.5
              ? 2.9
              : c.pitch >= 2.5
                ? 2.2
                : 0
            : c.pitch >= 5.5
              ? role === "compared"
                ? 2.1
                : 1.6
              : c.pitch >= 3.3
                ? c.noisy || role === "compared"
                  ? 1.4
                  : 1.1
                : 0,
    future,
  };
}

/**
 * Values that reverse direction at more than a quarter of the inner saves:
 * then the dots lead and the joins step back (the followed line excepted).
 */
export function isNoisy(lines: readonly ChartLine[]): boolean {
  let turns = 0;
  let inner = 0;
  for (const line of lines) {
    if (line.role === "subject") continue;
    const v = line.values;
    for (let i = 1; i < v.length - 1; i++) {
      const [a, b, c] = [v[i - 1], v[i], v[i + 1]];
      if (a === null || b === null || c === null) continue;
      inner++;
      if ((b - a) * (c - b) < 0) turns++;
    }
  }
  return inner > 0 && turns / inner > 0.25;
}

export type HistoryOptionInput = {
  days: readonly number[];
  lines: readonly ChartLine[];
  /** The world total: one line in the accent color. */
  world: boolean;
  /** A dot at each save; off for a yearly series. */
  dots: boolean;
  selected: number;
  /** The open save's column, or -1. */
  open: number;
  map: PlotMap;
  /** Show the zoom strip. */
  slider: boolean;
  /** A zoom is set; at rest the strip is only a faint track. */
  zoomed: boolean;
  sparse: boolean;
  /** A gap in days that is not drawn as a measured trend. */
  long: (gap: number) => boolean;
  /** The save years to label, as columns, or round ticks in days. */
  xLabels:
    | { kind: "saves"; columns: readonly number[] }
    | { kind: "ticks"; days: readonly number[] };
  yearOf: (day: number) => string;
  palette: Palette;
  dark: boolean;
  /** A round value on the value axis, with the axis step. */
  tick: (value: number, step: number) => string;
  font: string;
  /** The chart's full height in pixels, for the zoom strip. */
  height: number;
};

const PARTS = ["f", "g", "h", "d", "a"] as const;

/** The series ids in their fixed order. */
export function seriesIds(keys: readonly string[]): string[] {
  return [...keys.flatMap((key) => PARTS.map((part) => `${part}:${key}`)), "rules"];
}

/** The series ids of a line, to highlight it. */
export function lineSeriesIds(key: string): string[] {
  return PARTS.map((part) => `${part}:${key}`);
}

/** The column whose day is nearest, among those in view. */
export function nearestColumn(
  days: readonly number[],
  day: number,
  view?: readonly [number, number],
) {
  let best = -1;
  let distance = Infinity;
  days.forEach((at, i) => {
    if (view && (at < view[0] || at > view[1])) return;
    const gap = Math.abs(at - day);
    if (gap < distance) {
      distance = gap;
      best = i;
    }
  });
  return best;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/**
 * A game color too close to the ground gets an edge a step darker (or
 * lighter on the dark ground); the fill is never changed. D5's thresholds.
 */
export function edgeFor(hex: string, dark: boolean, ground: string): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const a = luminance(hex);
  const b = luminance(ground);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (ratio >= (dark ? 2.2 : 2.05)) return null;
  const n = parseInt(hex.slice(1), 16);
  const toward = dark ? 255 : 0;
  const f = dark ? 0.45 : 0.3;
  const m = (c: number) =>
    Math.round(c + (toward - c) * f)
      .toString(16)
      .padStart(2, "0");
  return `#${m(n >> 16)}${m((n >> 8) & 255)}${m(n & 255)}`;
}

type Point = [number, number | null];
type MarkPoints = NonNullable<NonNullable<LineSeriesOption["markPoint"]>["data"]>;

export function historyOption(input: HistoryOptionInput): EChartsOption {
  const { days, lines, selected, palette, map, dark } = input;
  const n = days.length;
  const selDay = days[selected];
  const inView = days.filter((day) => day >= map.from && day <= map.to);
  const pitch = inView.length > 1 ? map.width / (inView.length - 1) : map.width;
  const context: StrengthContext = {
    sparse: input.sparse,
    noisy: !input.world && isNoisy(lines),
    crowded: lines.length > 8,
    pitch,
    anySubject: lines.some((line) => line.role === "subject"),
    world: input.world,
    many: lines.length > 12,
  };

  const series: (LineSeriesOption | ScatterSeriesOption)[] = [];
  const visualMap: VisualMapComponentOption[] = [];

  for (const line of lines) {
    const grey = line.role === "grey";
    const own = strength(line.role, line.back, context);
    // Pointing highlights a line as compared and blurs the others to where they step back.
    const lit = strength(line.role === "plain" || grey ? "compared" : line.role, false, context);
    const dim = strength(line.role, true, context);
    const has = (i: number) => i >= 0 && i < n && line.values[i] !== null;
    const point = (i: number): Point => [days[i], line.values[i]];
    const first = line.colors.find((x) => x !== null) ?? palette.field;
    const colorAt = (i: number) =>
      input.world ? palette.accent : (line.colors[i] ?? line.colors[selected] ?? first);
    const shown = grey ? palette.field : input.world ? palette.accent : null;
    const litColor = input.world ? palette.accent : colorAt(selected);

    // A join between saves far apart is dotted: it is not a measured trend.
    const joins = (from: number, to: number) => {
      const solid: Point[] = [];
      const dotted: Point[] = [];
      for (let i = from; i <= to; i++) {
        solid.push(point(i));
        if (i === to || !has(i) || !has(i + 1)) continue;
        if (input.long(days[i + 1] - days[i])) {
          // A null at the earlier save's day ends the solid line without a point of its own.
          solid.push([days[i], null]);
          dotted.push(point(i), point(i + 1), [days[i + 1], null]);
        }
      }
      return { solid, dotted };
    };

    const z = grey ? 2 : line.role === "subject" ? 5 : line.role === "compared" ? 4 : 3;
    const color = (style: Record<string, unknown>) =>
      shown ? { ...style, color: shown } : line.changes.length ? style : { ...style, color: first };
    const edge = !grey && !input.world ? edgeFor(first, dark, palette.ground) : null;
    // A long join is dashed at rest, so a path can be followed, and goes to fine dots when it
    // recedes; either way nothing solid crosses a span with no saves.
    const dash = (role: LineRole, back: boolean, future: boolean) => {
      const lead = role === "subject" || role === "compared" || input.world;
      if (back && !lead)
        return {
          width: 1.7,
          type: [0.1, 3.6],
          cap: "round" as const,
          opacity: future ? 0.15 : 0.35,
        };
      return {
        width: role === "subject" ? 2.5 : role === "compared" ? 2 : role === "grey" ? 1 : 1.5,
        type: [5, 3],
        cap: "butt" as const,
        opacity: (lead ? 1 : role === "grey" ? 0.6 : 0.7) * (future ? 0.4 : 1),
      };
    };
    // A pale color keeps a soft darker edge, on dashes as on solid joins.
    const paleEdge = edge ? { shadowColor: edge, shadowBlur: 1.5 } : {};
    const dashStates = (future: boolean) => ({
      emphasis: {
        focus: "series" as const,
        blurScope: "coordinateSystem" as const,
        lineStyle: {
          ...dash(line.role === "subject" ? "subject" : "compared", false, future),
          ...(grey ? { color: litColor } : {}),
        },
      },
      blur: { lineStyle: dash(line.role, true, future) },
    });
    const states = (
      base: (s: Strength) => Record<string, unknown>,
      item?: (s: Strength) => object,
    ) => ({
      emphasis: {
        focus: "series" as const,
        blurScope: "coordinateSystem" as const,
        scale: false,
        lineStyle: { ...base(lit), ...(grey ? { color: litColor } : {}) },
        ...(item ? { itemStyle: { ...item(lit), ...(grey ? { color: litColor } : {}) } } : {}),
      },
      blur: {
        lineStyle: base(dim),
        ...(item ? { itemStyle: item(dim) } : {}),
      },
    });

    // A lone value has no join, so it keeps a dot even where the line has none.
    const lone = (i: number) => has(i) && !has(i - 1) && !has(i + 1);
    const future = joins(selected, n - 1);
    series.push({
      id: `f:${line.key}`,
      type: "line",
      z,
      silent: true,
      // After the selected save, lines are faded and without dots, as in D5; a lone value
      // there keeps a faded dot, so a "from" in the standings has a point to refer to.
      data: future.solid.map((p) => {
        const i = days.indexOf(p[0]);
        return p[1] !== null && i > selected && lone(i)
          ? { value: p, symbol: "circle", symbolSize: 4 }
          : p;
      }),
      showSymbol: future.solid.some(
        (p) => p[1] !== null && days.indexOf(p[0]) > selected && lone(days.indexOf(p[0])),
      ),
      symbolSize: 0,
      itemStyle: color({ opacity: Math.min(1, own.future * 2) }),
      connectNulls: false,
      clip: true,
      lineStyle: color({ width: own.width, opacity: own.future, cap: "round", join: "round" }),
      ...states((s) => ({ width: s.width, opacity: s.future })),
      animation: false,
    });
    series.push({
      id: `g:${line.key}`,
      type: "line",
      z,
      silent: true,
      data: future.dotted,
      symbol: "none",
      clip: true,
      lineStyle: color({ ...dash(line.role, line.back, true), ...paleEdge }),
      ...dashStates(true),
      animation: false,
    });

    const past = joins(0, selected);
    series.push({
      id: `h:${line.key}`,
      type: "line",
      z,
      silent: true,
      data: past.solid,
      symbol: "none",
      clip: true,
      // A ground-colored halo, 1 px each side, so crossing lines part.
      lineStyle: {
        color: palette.ground,
        width: own.width + 2,
        opacity: own.join,
        cap: "round",
        join: "round",
      },
      ...states((s) => ({ width: s.width + 2, opacity: s.join })),
      animation: false,
    });
    series.push({
      id: `d:${line.key}`,
      type: "line",
      z,
      silent: true,
      data: past.dotted,
      symbol: "none",
      clip: true,
      lineStyle: color({ ...dash(line.role, line.back, false), ...paleEdge }),
      ...dashStates(false),
      animation: false,
    });

    const radius = !input.dots ? 0 : own.radius;
    const size = (s: Strength) => (s.radius > 0 ? s.radius * 2 : 0);
    const pastLine: LineSeriesOption = {
      id: `a:${line.key}`,
      name: line.key,
      type: "line",
      z,
      silent: true,
      data: past.solid.map((p) => {
        const i = days.indexOf(p[0]);
        return radius === 0 && p[1] !== null && i >= 0 && lone(i)
          ? { value: p, symbol: "circle", symbolSize: 4 }
          : p;
      }),
      showSymbol: radius > 0 || past.solid.some((p) => p[1] !== null && lone(days.indexOf(p[0]))),
      symbol: "circle",
      symbolSize: radius > 0 ? size(own) : 0,
      connectNulls: false,
      clip: true,
      lineStyle: color({
        width: own.width,
        opacity: own.join,
        cap: "round",
        join: "round",
        ...paleEdge,
      }),
      itemStyle: color({
        opacity: own.dot,
        ...(edge ? { borderColor: edge, borderWidth: 0.7 } : {}),
      }),
      ...states(
        (s) => ({ width: s.width, opacity: s.join }),
        (s) => ({ opacity: s.dot }),
      ),
      animation: false,
    };
    if (!input.sparse && !grey && !input.world && line.changes.length) {
      // A tick where the tag changes between dense saves, as in D5.
      const marks: MarkPoints = [];
      for (const change of line.changes) {
        if (change.day > selDay) continue;
        const i = days.findIndex((day) => day >= change.day);
        if (i <= 0 || !has(i) || !has(i - 1) || input.long(days[i] - days[i - 1])) continue;
        const f = (change.day - days[i - 1]) / (days[i] - days[i - 1]);
        const value = line.values[i - 1]! + (line.values[i]! - line.values[i - 1]!) * f;
        marks.push({
          name: "change",
          coord: [change.day, value],
          symbol: "rect",
          symbolSize: [1, 10],
          itemStyle: { color: palette.ink, opacity: own.join },
        });
      }
      if (marks.length)
        pastLine.markPoint = {
          silent: true,
          animation: false,
          label: { show: false },
          emphasis: { disabled: true },
          data: marks,
        };
    }
    if (!shown && line.changes.length) {
      // A tag change recolors the line where it happens; inside a dotted join, at the next save.
      const index = series.length;
      const at = (day: number) => {
        const i = days.findIndex((d) => d > day);
        // Strictly inside a dotted join: a switch on a saved date keeps that save's color.
        return i > 0 &&
          days[i - 1] < day &&
          has(i - 1) &&
          has(i) &&
          input.long(days[i] - days[i - 1])
          ? days[i]
          : day;
      };
      const pieces: { gte: number; lt: number; color: string }[] = [];
      let from = days[0] - 1;
      let current = first;
      for (const change of line.changes) {
        const day = at(change.day);
        if (day <= from) {
          current = change.color;
          continue;
        }
        pieces.push({ gte: from, lt: day, color: current });
        from = day;
        current = change.color;
      }
      // Every piece is bounded: open-ended pieces leave ECharts 6.1 without stops.
      pieces.push({ gte: from, lt: Math.max(days[n - 1], from) + 2, color: current });
      visualMap.push({
        type: "piecewise",
        show: false,
        dimension: 0,
        seriesIndex: [index - 4, index - 3, index - 1, index],
        pieces,
      });
    }
    series.push(pastLine);
  }

  // The selected rule with its cap, the open save's dashed rule, and the cut of a zoom.
  type Rules = NonNullable<NonNullable<ScatterSeriesOption["markLine"]>["data"]>;
  type Caps = NonNullable<NonNullable<ScatterSeriesOption["markPoint"]>["data"]>;
  const rules: Rules = [
    { xAxis: selDay, lineStyle: { color: palette.rule, width: 1, type: "solid" } },
  ];
  const caps: Caps = [
    {
      name: "selected",
      coord: [selDay, map.hi],
      symbol: "triangle",
      symbolSize: [9, 7],
      symbolRotate: 180,
      symbolOffset: [0, -10],
      itemStyle: { color: palette.ink },
    },
  ];
  if (input.open >= 0 && input.open !== selected) {
    rules.push({
      xAxis: days[input.open],
      lineStyle: { color: palette.faint, width: 1, type: [2, 3] },
    });
    caps.push({
      name: "open",
      coord: [days[input.open], map.hi],
      symbol: "triangle",
      symbolSize: [9, 7],
      symbolRotate: 180,
      symbolOffset: [0, -10],
      itemStyle: { color: palette.ground, borderColor: palette.ink, borderWidth: 1 },
    });
  }
  if (map.from > days[0])
    rules.push({ xAxis: map.from, lineStyle: { color: palette.base, width: 1, type: [2, 3] } });
  if (map.to < days[n - 1])
    rules.push({ xAxis: map.to, lineStyle: { color: palette.base, width: 1, type: [2, 3] } });
  series.push({
    id: "rules",
    type: "scatter",
    z: 7,
    silent: true,
    data: [],
    markLine: {
      silent: true,
      animation: false,
      symbol: ["none", "none"],
      label: { show: false },
      emphasis: { disabled: true },
      blur: { lineStyle: { opacity: 1 } },
      data: rules,
    },
    markPoint: {
      silent: true,
      animation: false,
      label: { show: false },
      emphasis: { disabled: true },
      data: caps,
    },
    animation: false,
  });

  const labels =
    input.xLabels.kind === "saves"
      ? input.xLabels.columns.map((i) => days[i])
      : [...input.xLabels.days];
  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { fontFamily: input.font },
    grid: {
      left: map.left,
      top: map.top,
      width: map.width,
      height: map.height,
      outerBoundsMode: "none",
    },
    xAxis: {
      type: "value",
      min: days[0],
      max: Math.max(days[n - 1], days[0] + 1),
      axisLine: { show: true, lineStyle: { color: palette.base } },
      axisTick: {
        show: true,
        length: 5,
        // A tick at each save, every other one where they would run together (D5).
        customValues: days.filter((_, i) => pitch >= 2 || i % 2 === 0),
        lineStyle: { color: palette.faint },
      },
      axisLabel: {
        customValues: labels,
        formatter: (day: number) =>
          input.xLabels.kind === "saves" && day === selDay
            ? `{b|${input.yearOf(day)}}`
            : input.yearOf(day),
        rich: { b: { fontWeight: 700, color: palette.ink, fontSize: 12 } },
        color: palette.faint,
        fontSize: 12,
        margin: 10,
        hideOverlap: true,
      },
      splitLine: { show: false },
      axisPointer: { show: false },
    },
    yAxis: {
      type: "value",
      min: map.lo,
      max: map.hi,
      interval: map.step,
      axisLabel: {
        formatter: (value: number) => input.tick(value, map.step),
        color: palette.faint,
        fontSize: 11,
        margin: 8,
      },
      splitLine: { lineStyle: { color: palette.grid, width: 1 } },
      axisPointer: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    dataZoom: [
      {
        type: "slider",
        show: input.slider,
        xAxisIndex: 0,
        filterMode: "none",
        startValue: map.from,
        endValue: map.to,
        // A thin strip with small grips, as in D5; at rest a faint track that says time can be cut.
        top: map.top + map.height + 38,
        left: map.left,
        width: map.width,
        height: input.zoomed ? 6 : 4,
        showDetail: false,
        brushSelect: false,
        showDataShadow: false,
        borderColor: "transparent",
        backgroundColor: palette.grid,
        fillerColor: input.zoomed ? palette.base : palette.grid,
        borderRadius: 3,
        handleIcon: "path://M0,0 h2.5 v10 h-2.5 z",
        handleSize: input.zoomed ? 14 : 10,
        handleStyle: {
          color: input.zoomed ? palette.muted : palette.base,
          borderColor: input.zoomed ? palette.muted : palette.base,
        },
        moveHandleSize: 0,
        emphasis: { handleStyle: { color: palette.ink, borderColor: palette.ink } },
      },
    ],
    visualMap,
    series,
  } as EChartsOption;
}
