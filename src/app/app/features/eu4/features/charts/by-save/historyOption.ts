import type { CustomSeriesOption, LineSeriesOption, ScatterSeriesOption } from "echarts/charts";
import type { VisualMapComponentOption } from "echarts/components";
import type { EChartsOption } from "@/components/viz/EChart";
import { placeRows } from "./history";
import type { ValueScale } from "./history";

/**
 * The plot of the history chart as an ECharts option: one line for each
 * country on one value scale, a dot at each save, the selected time as a
 * rule with what follows it faded, gap sticks to a compared country, and
 * the leaders from the selected marks to the standings beside the plot.
 *
 * The series keep one order and one count, whatever is pointed at or
 * pinned: the axis pointer remembers what it emphasized by series index.
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
    field: "#a3a9b3",
    accent: "#0284c7",
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
  },
};

/** How a line stands: followed, compared, plain, or out of color. */
export type LineRole = "subject" | "compared" | "plain" | "grey";

export type ChartLine = {
  key: string;
  /** The value at each column, or null. */
  values: readonly (number | null)[];
  /** The color of the tag held at each column with a value. */
  colors: readonly (string | null)[];
  /** The name of the tag held at each column with a value. */
  names: readonly (string | null)[];
  /** Days where the line changes tag, with the color after. */
  changes: readonly { day: number; color: string }[];
  role: LineRole;
  /** Another line is compared, and this one steps back. */
  back: boolean;
};

export type Leader = {
  value: number;
  /** The center of the row's place beside the plot, in pixels from the chart's top. */
  rowY: number;
  color: string;
  role: LineRole;
  back: boolean;
};

export type Comparison = {
  subject: ChartLine;
  rival: ChartLine;
  /** The column where the present order began, to ring. */
  since: number | null;
};

export type HistoryOptionInput = {
  days: readonly number[];
  lines: readonly ChartLine[];
  /** The world total: one line, its figure beside the selected mark, no standings. */
  world: boolean;
  /** A dot at each save; off for a yearly series. */
  dots: boolean;
  selected: number;
  /** The open save's column, or -1. */
  open: number;
  /** The days in view; the whole campaign when not zoomed. */
  view: readonly [number, number];
  /** Show the zoom slider. */
  slider: boolean;
  scale: ValueScale;
  grid: { left: number; right: number; top: number; height: number };
  /** The width between the plot and the standings, where the leaders bend. */
  fan: number;
  /** The plot's width in pixels. */
  plotWidth: number;
  /** Sparse saves lead with their dots. */
  sparse: boolean;
  /** A gap in days that is drawn dotted. */
  long: (gap: number) => boolean;
  /** The save years to label, as columns, or round ticks in days. */
  xLabels:
    | { kind: "saves"; columns: readonly number[] }
    | { kind: "ticks"; days: readonly number[] };
  /** The label of a day on the axis, and of the hovered save. */
  yearOf: (day: number) => string;
  dateOf: (day: number) => string;
  leaders: readonly Leader[] | null;
  comparison: Comparison | null;
  palette: Palette;
  dark: boolean;
  format: (value: number) => string;
  /** A round value on the value axis, with the axis step. */
  tick: (value: number, step: number) => string;
  font: string;
};

/** The series ids in their fixed order. */
export function seriesIds(keys: readonly string[]): string[] {
  return [
    ...keys.flatMap((key) => ["f", "g", "h", "d", "a"].map((part) => `${part}:${key}`)),
    "sticks",
    "breaks",
    "leaders",
    "marks",
  ];
}

/** The dot radius of a line, from the pixels between saves. */
export function dotRadius(role: LineRole, pitch: number, sparse: boolean): number {
  if (sparse) return role === "subject" ? 4.6 : role === "compared" ? 4 : role === "grey" ? 2 : 3.4;
  if (role === "grey") return pitch >= 4 ? 1 : 0;
  if (role === "subject") return pitch >= 5.5 ? 2.9 : pitch >= 2.5 ? 2.2 : 0;
  if (pitch >= 5.5) return role === "compared" ? 2.1 : 1.6;
  return pitch >= 3.3 ? (role === "compared" ? 1.4 : 1.1) : 0;
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

const rgbaOf = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
};

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/** A game color too close to the ground gets an edge a step darker or lighter; the fill is never changed. */
export function edgeFor(hex: string, dark: boolean, ground: string): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const a = luminance(hex);
  const b = luminance(ground);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (ratio >= (dark ? 2.2 : 1.6)) return null;
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

export function historyOption(input: HistoryOptionInput): EChartsOption {
  const { days, lines, selected, palette, scale, grid, dark } = input;
  const n = days.length;
  const selDay = days[selected];
  const span = Math.max(1, input.view[1] - input.view[0]);
  const pxPerDay = input.plotWidth / span;
  const inView = days.filter((day) => day >= input.view[0] && day <= input.view[1]);
  const pitch = inView.length > 1 ? input.plotWidth / (inView.length - 1) : input.plotWidth;
  const yPx = (value: number) =>
    grid.top + grid.height * (1 - (value - scale.lo) / (scale.hi - scale.lo || 1));
  const xPx = (day: number) => grid.left + (day - input.view[0]) * pxPerDay;
  const anyCompared = lines.some((line) => line.role === "compared");
  const anySubject = lines.some((line) => line.role === "subject");
  const crowded = lines.length > 8;

  // Hover figures do not push each other apart in ECharts, so each one's nudge is set here.
  const nudges = new Map<string, Map<number, number>>(lines.map((line) => [line.key, new Map()]));
  for (let i = 0; i < n; i++) {
    if (days[i] < input.view[0] || days[i] > input.view[1]) continue;
    const at = lines
      .filter((line) => line.role !== "grey" && line.values[i] !== null)
      .map((line) => ({ line, y: yPx(line.values[i]!) }))
      .sort((a, b) => a.y - b.y);
    const { tops } = placeRows(
      at.map((x) => ({ want: x.y, height: 13 })),
      grid.top - 6,
      grid.top + grid.height + 6,
    );
    at.forEach((x, k) => {
      const dy = Math.round(tops[k] + 6.5 - x.y);
      if (dy) nudges.get(x.line.key)!.set(i, dy);
    });
  }

  const series: (LineSeriesOption | CustomSeriesOption | ScatterSeriesOption)[] = [];
  const visualMap: VisualMapComponentOption[] = [];
  /** Values with no save beside them, drawn as dots on any line. */
  const lone: object[] = [];
  /** Breaks in joins where the tag changes: day, value, width, z. */
  const breaks: [number, number, number, number][] = [];

  for (const line of lines) {
    const { role, back } = line;
    const grey = role === "grey";
    const lead = role === "subject" || role === "compared" || input.world;
    const free = !anySubject && !lead && !grey;
    const sparse = input.sparse && !input.world;
    const width = input.world
      ? 2
      : sparse
        ? role === "subject"
          ? 2.25
          : role === "compared"
            ? 1.75
            : 1
        : role === "subject"
          ? 2.75
          : role === "compared"
            ? 2
            : grey
              ? 1
              : crowded
                ? 1.25
                : 1.5;
    const joinOpacity = lead
      ? 1
      : grey
        ? anyCompared
          ? 0.35
          : 0.7
        : back
          ? sparse
            ? 0.18
            : 0.22
          : sparse
            ? 0.5
            : free
              ? crowded
                ? 0.7
                : 0.85
              : crowded
                ? 0.55
                : 0.72;
    const dotOpacity = lead
      ? 1
      : grey
        ? anyCompared
          ? 0.25
          : 0.45
        : back
          ? 0.28
          : sparse
            ? 1
            : crowded
              ? 0.6
              : 0.75;
    const radius = !input.dots ? 0 : input.world ? 2.6 : dotRadius(role, pitch, sparse);
    const futureOpacity = (lead ? 0.38 : grey ? 0.3 : 0.28) * (back ? 0.6 : 1);
    const first = line.colors.find((x) => x !== null) ?? palette.field;
    const colorOf = (i: number) =>
      grey ? palette.field : input.world ? palette.accent : (line.colors[i] ?? first);
    const recolors = !grey && !input.world && line.changes.length > 0;
    const point = (i: number): Point => [days[i], line.values[i]];
    const has = (i: number) => i >= 0 && i < n && line.values[i] !== null;

    const z = grey ? 2 : role === "subject" ? 5 : role === "compared" ? 4 : 3;
    // Every point of a hovered line is a save, so the axis pointer finds the same save on
    // every line: a gap is a null at the day of the save before it.
    const joins = (from: number, to: number) => {
      const solid: Point[] = [];
      const dotted: Point[] = [];
      for (let i = from; i <= to; i++) {
        solid.push(point(i));
        if (i === to || !has(i) || !has(i + 1)) continue;
        const gap = days[i + 1] - days[i];
        if (input.long(gap)) {
          // A long join is dotted, and the solid line has a gap there.
          solid.push([days[i], null]);
          dotted.push(point(i), point(i + 1), [days[i + 1], null]);
        } else if (sparse && !grey && i < selected) {
          // A small break where the tag changes inside a sparse join, so the color change reads.
          const [a, b] = [line.values[i]!, line.values[i + 1]!];
          for (const cut of line.changes) {
            if (cut.day <= days[i] || cut.day >= days[i + 1]) continue;
            breaks.push([cut.day, a + ((b - a) * (cut.day - days[i])) / gap, width + 2, z]);
          }
        }
      }
      return { solid, dotted };
    };

    // The chart places the hover itself, so the lines take no pointer events of their own.
    const tooltip = grey ? { tooltip: { show: false }, silent: true } : { silent: true };
    const label = (future: boolean) => ({
      show: true,
      position: "right" as const,
      distance: 5,
      fontSize: 11,
      fontWeight: lead ? 700 : 500,
      color: lead ? palette.ink : palette.muted,
      textBorderColor: palette.ground,
      textBorderWidth: 3,
      formatter: (params: { value: unknown }) => {
        const [day, value] = params.value as [number, number | null];
        // The selected save's figure is in the standings, and the future line repeats its first point.
        if (value === null || (future && day === selDay)) return "";
        const i = days.indexOf(day);
        const name = role === "compared" && i >= 0 ? `${line.names[i] ?? ""} ` : "";
        return `${name}${input.format(value)}`;
      },
    });
    // Points that need their own emphasis: a nudged or flipped hover figure, or a recolored mark.
    const item = (p: Point, i: number): Point | object => {
      if (p[1] === null) return p;
      // A point that is no save, at the ends of a break, has no dot.
      if (i < 0) return { value: p, symbol: "none", emphasis: { disabled: true } };
      const dy = nudges.get(line.key)!.get(i) ?? 0;
      const flip = xPx(p[0]) + 70 > grid.left + input.plotWidth;
      if (!dy && !flip) return p;
      return {
        value: p,
        emphasis: {
          label: { ...(flip ? { position: "left" } : {}), ...(dy ? { offset: [0, dy] } : {}) },
        },
      };
    };
    const edge = !grey && !input.world ? edgeFor(first, dark, palette.ground) : null;
    const emphasis = (size: number) => ({
      disabled: grey,
      scale: (role === "subject" ? 9.5 : 7.5) / Math.max(size, 1),
      itemStyle: { opacity: 1, borderColor: palette.ground, borderWidth: 1.5 },
      lineStyle: { width },
    });
    const colored = (style: Record<string, unknown>) =>
      recolors ? style : { ...style, color: colorOf(selected) };

    // The future first, so the past of every line lies over it.
    const future = joins(selected, n - 1);
    const futureSize = Math.max(radius * 2, 3);
    series.push({
      id: `f:${line.key}`,
      type: "line",
      z,
      data: future.solid.map((p) => item(p, days.indexOf(p[0]))),
      // Later saves keep their dots, faded, as a dot says a point is a save.
      showSymbol: radius > 0,
      symbol: "circle",
      symbolSize: futureSize,
      connectNulls: false,
      clip: true,
      lineStyle: colored({ width, opacity: futureOpacity, cap: "round", join: "round" }),
      itemStyle: colored({ opacity: Math.min(1, futureOpacity * 1.4) }),
      emphasis: { ...emphasis(futureSize), label: label(true) },
      animation: false,
      ...tooltip,
    });
    series.push({
      id: `g:${line.key}`,
      type: "line",
      z,
      data: future.dotted,
      silent: true,
      symbol: "none",
      clip: true,
      emphasis: { disabled: true },
      tooltip: { show: false },
      lineStyle: colored({
        width: Math.max(1.6, width - 0.4),
        type: [0.1, 4],
        cap: "round",
        opacity: futureOpacity,
      }),
      animation: false,
    });

    const past = joins(0, selected);
    series.push({
      id: `h:${line.key}`,
      type: "line",
      z,
      data: past.solid,
      silent: true,
      symbol: "none",
      clip: true,
      emphasis: { disabled: true },
      tooltip: { show: false },
      // A ground-colored halo, so crossing lines part.
      lineStyle: {
        color: palette.ground,
        width: sparse ? 0 : width + 2,
        opacity: joinOpacity,
        cap: "round",
        join: "round",
      },
      animation: false,
    });
    series.push({
      id: `d:${line.key}`,
      type: "line",
      z,
      data: past.dotted,
      silent: true,
      symbol: "none",
      clip: true,
      emphasis: { disabled: true },
      tooltip: { show: false },
      lineStyle: colored({
        width: Math.max(1.6, width - 0.4),
        type: [0.1, 4],
        cap: "round",
        opacity: lead ? 1 : Math.min(1, joinOpacity + 0.15),
      }),
      animation: false,
    });

    const size = radius > 0 ? radius * 2 : 3;
    // A lone value has no join, so it shows as a dot even where the line has none.
    if (radius === 0) {
      for (let i = 0; i < n; i++) {
        if (!has(i) || has(i - 1) || has(i + 1)) continue;
        if (days[i] < input.view[0] || days[i] > input.view[1]) continue;
        const after = i > selected;
        lone.push({
          value: [days[i], line.values[i]!],
          symbolSize: 4,
          itemStyle: {
            color: colorOf(i),
            opacity: after ? futureOpacity * 1.4 : grey ? dotOpacity : Math.max(dotOpacity, 0.8),
          },
        });
      }
    }
    const pastLine: LineSeriesOption = {
      id: `a:${line.key}`,
      name: line.key,
      type: "line",
      z,
      data: past.solid.map((p) => item(p, days.indexOf(p[0]))),
      showSymbol: radius > 0,
      symbol: "circle",
      symbolSize: size,
      connectNulls: false,
      clip: true,
      lineStyle: colored({ width, opacity: joinOpacity, cap: "round", join: "round" }),
      itemStyle: colored({
        opacity: dotOpacity,
        // Large dots part with a ground edge; a pale color keeps its own.
        ...(sparse && radius > 2.5
          ? { borderColor: edge ?? palette.ground, borderWidth: edge ? 1 : 1.25 }
          : edge
            ? { borderColor: edge, borderWidth: 0.8 }
            : {}),
      }),
      emphasis: { ...emphasis(size), label: label(false) },
      animation: false,
      ...tooltip,
    };
    const marks: NonNullable<NonNullable<LineSeriesOption["markPoint"]>["data"]> = [];
    if (!sparse && recolors) {
      // A tick where the tag changes between dense saves.
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
          itemStyle: { color: palette.ink, opacity: lead ? 1 : joinOpacity },
        });
      }
    }
    const comparison = input.comparison;
    if (role === "subject" && comparison && comparison.since !== null) {
      const at = comparison.since;
      if (line.values[at] !== null)
        marks.push({
          name: "since",
          coord: [days[at], line.values[at]!],
          symbol: "circle",
          symbolSize: 17,
          itemStyle: { color: "transparent", borderColor: palette.ink, borderWidth: 1.25 },
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
    if (recolors) {
      const index = series.length;
      const pieces: { gte: number; lt: number; color: string }[] = [];
      let from = days[0] - 1;
      let color = first;
      for (const change of line.changes) {
        if (change.day <= from) {
          color = change.color;
          continue;
        }
        pieces.push({ gte: from, lt: change.day, color });
        from = change.day;
        color = change.color;
      }
      // Every piece is bounded: open-ended pieces leave ECharts 6.1 without stops.
      pieces.push({ gte: from, lt: Math.max(days[n - 1], from) + 2, color });
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

  // The gap to the compared country at each save, in the color of whoever is ahead there.
  const sticks: [number, number, number, string][] = [];
  const comparison = input.comparison;
  if (comparison) {
    const every = Math.max(1, Math.ceil((selected + 1) / 110));
    for (let i = 0; i <= selected; i += every) {
      const a = comparison.subject.values[i];
      const b = comparison.rival.values[i];
      if (a === null || b === null || a === b) continue;
      const color =
        a > b
          ? (comparison.subject.colors[i] ?? palette.ink)
          : (comparison.rival.colors[i] ?? palette.ink);
      sticks.push([days[i], a, b, color]);
    }
  }
  series.push({
    id: "sticks",
    type: "custom",
    z: 1,
    silent: true,
    tooltip: { show: false },
    clip: true,
    data: sticks.map(([x, a, b], k) => [x, a, b, k]),
    encode: { x: 0, y: [1, 2] },
    renderItem: (_params, api) => {
      const [x, a, b, k] = [0, 1, 2, 3].map((d) => Number(api.value(d)));
      const p = api.coord([x, a]);
      const q = api.coord([x, b]);
      return {
        type: "line",
        shape: { x1: p[0], y1: p[1], x2: q[0], y2: q[1] },
        style: { stroke: sticks[k][3], opacity: 0.45, lineWidth: 1 },
      };
    },
    animation: false,
  });

  // The breaks lie over the lines, in the ground's color.
  series.push({
    id: "breaks",
    type: "custom",
    z: 6,
    silent: true,
    tooltip: { show: false },
    clip: true,
    data: breaks.map(([x, y], k) => [x, y, k]),
    encode: { x: 0, y: 1 },
    renderItem: (_params, api) => {
      const [x, y, k] = [0, 1, 2].map((d) => Number(api.value(d)));
      const [px, py] = api.coord([x, y]);
      return {
        type: "line",
        shape: { x1: px - 2, y1: py, x2: px + 2, y2: py },
        style: { stroke: palette.ground, lineWidth: breaks[k][2] + 2 },
        z2: breaks[k][3],
      };
    },
    animation: false,
  });

  // The leaders: from each mark at the selected time, level to the plot's edge, then to its row.
  const leaders = input.leaders ?? [];
  series.push({
    id: "leaders",
    type: "custom",
    z: 6,
    silent: true,
    tooltip: { show: false },
    clip: false,
    data: leaders.map((leader, k) => [selDay, leader.value, k]),
    renderItem: (params, api) => {
      const k = Number(api.value(2));
      const leader = leaders[k];
      const box = params.coordSys as unknown as { x: number; width: number };
      const plotR = box.x + box.width;
      const tableX = plotR + input.fan;
      const [sx, sy] = api.coord([selDay, leader.value]);
      const fromX = Math.max(box.x, Math.min(plotR, sx)) + 7;
      const y = Math.round(sy) + 0.5;
      const ry = Math.round(leader.rowY) + 0.5;
      const lead = leader.role === "subject" || leader.role === "compared";
      const stroke = lead ? palette.ink : palette.faint;
      const dim = leader.back ? 0.45 : 1;
      return {
        type: "group",
        children: [
          {
            type: "polyline",
            // From far off, a level line across the plot would read as data; the bend starts at the edge.
            ignore: plotR - fromX <= 2 || plotR - fromX > 60,
            shape: {
              points: [
                [fromX, y],
                [plotR + 5, y],
              ],
            },
            style: { fill: "none", stroke, opacity: (lead ? 0.55 : 0.35) * dim, lineWidth: 1 },
          },
          {
            type: "polyline",
            shape: {
              points: [
                [plotR + 5, y],
                [plotR + 9, y],
                [tableX - 12, ry],
                [tableX - 8, ry],
              ],
            },
            style: { fill: "none", stroke, opacity: (lead ? 0.9 : 0.55) * dim, lineWidth: 1 },
          },
          {
            type: "rect",
            shape: {
              x: tableX - 6,
              y: Math.round(ry - (leader.role === "subject" ? 8 : 6)),
              width: leader.role === "grey" ? 3 : 4,
              height: leader.role === "subject" ? 16 : 12,
            },
            style: { fill: leader.color, opacity: dim },
          },
        ],
      };
    },
    animation: false,
  });

  // The marks at the selected time. Marks that would pile up show as one, ringed.
  const at = lines
    .filter((line) => line.role !== "grey" && line.values[selected] !== null)
    .map((line) => ({ line, y: yPx(line.values[selected]!) }))
    .sort((a, b) => a.y - b.y);
  const groups: (typeof at)[] = [];
  for (const mark of at) {
    const last = groups.at(-1);
    if (last && mark.y - last.at(-1)!.y < 4) last.push(mark);
    else groups.push([mark]);
  }
  const rank = (role: LineRole) => (role === "subject" ? 0 : role === "compared" ? 1 : 2);
  const selectedMarks = groups.map((group) => {
    const front = [...group].sort((a, b) => rank(a.line.role) - rank(b.line.role))[0];
    const color = input.world ? palette.accent : (front.line.colors[selected] ?? palette.ink);
    const radius = front.line.role === "subject" ? 4.6 : 3.8;
    const edge = input.world ? null : edgeFor(color, dark, palette.ground);
    return {
      value: [selDay, front.line.values[selected]],
      symbolSize: radius * 2 + 1.5,
      itemStyle: {
        color,
        borderColor: group.length > 1 ? palette.ink : (edge ?? palette.ground),
        borderWidth: group.length > 1 ? 1.5 : edge ? 1 : 1.5,
        opacity: front.line.back ? 0.35 : 1,
      },
      ...(input.world
        ? {
            label: {
              show: true,
              position: "right" as const,
              distance: 10,
              formatter: () => input.format(front.line.values[selected]!),
              fontSize: 18,
              fontWeight: 700,
              color: palette.ink,
              textBorderColor: palette.ground,
              textBorderWidth: 3,
            },
          }
        : {}),
    };
  });
  const rules: NonNullable<NonNullable<ScatterSeriesOption["markLine"]>["data"]> = [
    { xAxis: selDay, lineStyle: { color: palette.rule, width: 1, type: "solid" } },
  ];
  const caps: NonNullable<NonNullable<ScatterSeriesOption["markPoint"]>["data"]> = [
    {
      name: "selected",
      coord: [selDay, scale.hi],
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
      coord: [days[input.open], scale.hi],
      symbol: "triangle",
      symbolSize: [9, 7],
      symbolRotate: 180,
      symbolOffset: [0, -10],
      itemStyle: { color: palette.ground, borderColor: palette.ink, borderWidth: 1 },
    });
  }
  // A zoomed view says where it is cut.
  if (input.view[0] > days[0])
    rules.push({
      xAxis: input.view[0],
      lineStyle: { color: palette.base, width: 1, type: [2, 3] },
    });
  if (input.view[1] < days[n - 1])
    rules.push({
      xAxis: input.view[1],
      lineStyle: { color: palette.base, width: 1, type: [2, 3] },
    });
  series.push({
    id: "marks",
    type: "scatter",
    z: 7,
    silent: true,
    tooltip: { show: false },
    symbol: "circle",
    clip: false,
    data: [...lone, ...selectedMarks],
    emphasis: { disabled: true },
    markLine: {
      silent: true,
      animation: false,
      symbol: ["none", "none"],
      label: { show: false },
      emphasis: { disabled: true },
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
  const step = scale.ticks.length > 1 ? scale.ticks[1] - scale.ticks[0] : undefined;
  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { fontFamily: input.font },
    grid: { ...grid, outerBoundsMode: "none" },
    // The chart drives the axis pointer itself, from one save in view.
    axisPointer: { triggerOn: "none" },
    xAxis: {
      type: "value",
      min: days[0],
      max: days[n - 1],
      axisLine: { show: true, lineStyle: { color: palette.base } },
      axisTick: {
        show: true,
        length: 5,
        // A tick at each save, thinned where they would run together.
        customValues: days.filter(
          (_, i) => i % Math.max(1, Math.ceil(3 / Math.max(pitch, 0.01))) === 0,
        ),
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
      axisPointer: {
        show: true,
        snap: true,
        type: "line",
        triggerEmphasis: true,
        triggerTooltip: false,
        lineStyle: { color: palette.hoverRule, width: 1, type: "solid" },
        label: {
          show: true,
          formatter: (params: { value: unknown }) => {
            // The save that the pointer's emphasis takes, also one just past a cut.
            const i = nearestColumn(days, Number(params.value));
            return i >= 0 ? input.dateOf(days[i]) : "";
          },
          backgroundColor: palette.ground,
          color: palette.ink,
          borderColor: palette.base,
          borderWidth: 1,
          padding: [2, 5],
          fontSize: 11,
          fontWeight: 600,
          margin: 3,
        },
      },
    },
    yAxis: {
      type: "value",
      min: scale.lo,
      max: scale.hi,
      interval: step,
      axisLabel: {
        formatter: (value: number) => input.tick(value, step ?? 1),
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
        startValue: input.view[0],
        endValue: input.view[1],
        bottom: 4,
        height: 18,
        showDetail: false,
        brushSelect: false,
        showDataShadow: false,
        borderColor: palette.grid,
        fillerColor: rgbaOf(palette.base, 0.18),
        handleStyle: { color: palette.ground, borderColor: palette.base },
        moveHandleSize: 0,
      },
    ],
    visualMap,
    series,
  } as EChartsOption;
}
