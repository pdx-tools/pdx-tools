import { useMemo, useState } from "react";
import type * as echarts from "echarts/core";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartInk,
  chartText,
  chartTextWidth,
  chartTooltip,
  dotRim,
  labelHalo,
  neutralMark,
  yAxisName,
} from "@/components/viz/echartsTheme";
import { formatInt } from "@/lib/format";
import type { CountryRef, SelectionTargetData } from "@/wasm/wasm_eu5";
import { formatTick } from "../../numberFormatting";
import { useEu5HomeCountry } from "../../store";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { useEu5EntityChartClick } from "./useEntityChartClick";

/** Room after the largest value, so that its dot stays in the plot */
const LOG_HEADROOM = 1.5;

export interface LogDomain {
  /** The left end of the axis: a power of 10 at or under the smallest value above zero */
  floor: number;
  /** The right end of the axis */
  ceiling: number;
  /** The number of values at zero or under. Each one is on the floor. */
  onFloor: number;
  /** Some values are under zero, so the floor's tick is not "0" */
  hasNegative: boolean;
}

/**
 * The extent of a log axis. A log axis has no place for a value at zero or
 * under, and ECharts drops such a value with no message. So it goes on the
 * floor, one decade under the smallest value above zero, apart from them.
 */
export function logDomain(values: Iterable<number>): LogDomain {
  let smallest = Infinity;
  let largest = 0;
  let onFloor = 0;
  let hasNegative = false;
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      smallest = Math.min(smallest, value);
      largest = Math.max(largest, value);
    } else {
      onFloor += 1;
      hasNegative ||= value < 0;
    }
  }
  const decade = largest > 0 ? Math.floor(Math.log10(smallest)) : 0;
  const floor = 10 ** (onFloor > 0 ? decade - 1 : decade);
  // The axis spans one decade or more, so that it has two ticks.
  const ceiling = Math.max(largest * LOG_HEADROOM, floor * 10);
  return { floor, ceiling, onFloor, hasNegative };
}

/** The position of a value on a log axis */
export function logPosition(value: number, domain: LogDomain): number {
  return Number.isFinite(value) && value > 0 ? value : domain.floor;
}

/** The text of a tick on a log axis */
export function logTick(value: number, domain: LogDomain): string {
  const onFloor = domain.onFloor > 0 && Math.abs(value - domain.floor) <= domain.floor * 1e-6;
  if (onFloor) return domain.hasNegative ? "≤0" : "0";
  return formatTick(value);
}

/** The scale of a log axis. The caller gives the name. */
export function logAxis(domain: LogDomain) {
  return {
    type: "log" as const,
    min: domain.floor,
    max: domain.ceiling,
    axisLabel: {
      hideOverlap: true,
      // A ceiling that is not a power of 10 has no tick.
      showMaxLabel: Number.isInteger(Math.log10(domain.ceiling)),
      formatter: (value: number) => logTick(value, domain),
    },
  };
}

/**
 * Says how many dots are on the 0 edge of a log axis, because the axis
 * has no other place for them.
 */
export function LogFloorNote({
  count,
  noun,
  what,
  negative = false,
  edge = "left edge",
}: {
  count: number;
  noun: { one: string; many: string };
  /** What a dot on the edge has none of */
  what: string;
  /** Some of the values are under zero */
  negative?: boolean;
  edge?: string;
}) {
  if (count === 0) return null;
  const has = negative ? `${what} at 0 or under` : `no ${what}`;
  return (
    <p className="mt-1 text-[12px] text-game-ink-500">
      {formatInt(count)} {count === 1 ? noun.one : noun.many} with {has}{" "}
      {count === 1 ? "is" : "are"} on the {edge}, at 0.
    </p>
  );
}

/** Where a country goes on a scatter */
export interface CountryPoint {
  country: CountryRef;
  x: number;
  y: number;
  /** The size in px of a dot whose area shows a third value */
  symbolSize?: number;
}

/** The countries that a scatter names first */
export interface ScatterMarks {
  /** The player's country in a save with one player */
  home: number | null;
  /** The selection: the Players preset, or the countries that it names */
  target: SelectionTargetData | null;
}

/** The largest countries that have a label on a scatter, by the x value */
const TOP_LABELS = 5;

const NEUTRAL_DOT = 7;
const COLORED_DOT = 8;
const LABELED_DOT = 10;

export interface ScatterDot<T> {
  row: T;
  point: CountryPoint;
  value: [number, number];
  symbolSize: number;
  /** In its game color, with a rim: a player or a dot with a label */
  colored: boolean;
  labeled: boolean;
  /** The home country or a selected country: its label goes first */
  marked: boolean;
}

function selectedTest(target: SelectionTargetData | null): (country: CountryRef) => boolean {
  switch (target?.kind) {
    case "players":
      return (country) => country.isPlayer;
    case "countries": {
      const ids = new Set(target.ids);
      return (country) => ids.has(country.country.key);
    }
    default:
      return () => false;
  }
}

/**
 * The dots of a scatter of countries, in the order to draw them. Most dots
 * are a muted grey, because a hue on hundreds of dots shows no pattern. The
 * players have their game color. The home country, the selected countries
 * and the five largest also have a label. With two players or more, the five
 * largest are players. The dots with a label come last, so they are on top.
 */
export function scatterDots<T>(
  rows: readonly T[],
  point: (row: T) => CountryPoint,
  domain: { x: LogDomain; y?: LogDomain },
  marks: ScatterMarks,
): ScatterDot<T>[] {
  const points = rows.map(point);
  const players = points.filter((p) => p.country.isPlayer);
  const largest = new Set(
    [...(players.length > 1 ? players : points)]
      .sort((a, b) => b.x - a.x)
      .slice(0, TOP_LABELS)
      .map((p) => p.country.country.key),
  );
  const isSelected = selectedTest(marks.target);
  const dots = rows.map((row, i): ScatterDot<T> => {
    const p = points[i]!;
    const key = p.country.country.key;
    const marked = key === marks.home || isSelected(p.country);
    const labeled = marked || largest.has(key);
    const colored = labeled || p.country.isPlayer;
    const y = domain.y ? logPosition(p.y, domain.y) : p.y;
    return {
      row,
      point: p,
      value: [logPosition(p.x, domain.x), y],
      symbolSize: p.symbolSize ?? (labeled ? LABELED_DOT : colored ? COLORED_DOT : NEUTRAL_DOT),
      colored,
      labeled,
      marked,
    };
  });
  const layer = (d: ScatterDot<T>) => (d.marked ? 3 : d.labeled ? 2 : d.colored ? 1 : 0);
  return dots.sort((a, b) => layer(a) - layer(b));
}

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Labels keep this much space between them on a line */
const LABEL_SPACE = 3;
const LABEL_GAP = 4;
const LABEL_HEIGHT = 14;
/** The distances of the far places, which have a line to the dot */
const LEADER_RADII = [28, 52];

const overlaps = (a: LabelRect, b: LabelRect) =>
  a.x < b.x + b.width + LABEL_SPACE &&
  b.x < a.x + a.width + LABEL_SPACE &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const contains = (outer: LabelRect, rect: LabelRect) =>
  rect.x >= outer.x &&
  rect.y >= outer.y &&
  rect.x + rect.width <= outer.x + outer.width &&
  rect.y + rect.height <= outer.y + outer.height;

/**
 * Where a label goes around its dot: the first place that is in the plot and
 * overlaps nothing in `placed`, or null when no place is free. Near the right
 * end of the plot, a label reads back into the plot. The far places come last.
 */
export function labelPlace(
  dot: LabelRect,
  width: number,
  placed: readonly LabelRect[],
  plot: LabelRect,
): LabelRect | null {
  const height = LABEL_HEIGHT;
  const cx = dot.x + dot.width / 2;
  const cy = dot.y + dot.height / 2;
  const middle = cy - height / 2;
  const right = { x: dot.x + dot.width + LABEL_GAP, y: middle, width, height };
  const left = { x: dot.x - LABEL_GAP - width, y: middle, width, height };
  const above = { x: cx - width / 2, y: dot.y - LABEL_GAP - height, width, height };
  const below = { x: cx - width / 2, y: dot.y + dot.height + LABEL_GAP, width, height };
  const late = cx > plot.x + plot.width * 0.7;
  const near = late ? [left, above, below, right] : [right, above, below, left];
  const far = LEADER_RADII.flatMap((radius) =>
    [-0.8, 0.8, -0.3, 0.3, Math.PI - 0.8, Math.PI + 0.8, Math.PI - 0.3, Math.PI + 0.3].map(
      (angle) => ({
        x: cx + Math.cos(angle) * radius - (Math.cos(angle) < 0 ? width : 0),
        y: cy + Math.sin(angle) * radius - height / 2,
        width,
        height,
      }),
    ),
  );
  return (
    [...near, ...far].find(
      (rect) => contains(plot, rect) && !placed.some((other) => overlaps(rect, other)),
    ) ?? null
  );
}

/**
 * The places of the labels. Each dot is in `dots`, and a dot with a label
 * width has a label. The labels take their place in the order of `dots`,
 * and no label covers a dot of the list.
 */
export function placeLabels(
  dots: readonly { rect: LabelRect; width?: number }[],
  plot: LabelRect,
): (LabelRect | null)[] {
  const placed = dots.map((d) => d.rect);
  return dots.map((d) => {
    if (d.width === undefined) return null;
    const place = labelPlace(d.rect, d.width, placed, plot);
    if (place) placed.push(place);
    return place;
  });
}

/** The countries that a scatter names first, from the save and the selection */
function useScatterMarks(): ScatterMarks {
  const home = useEu5HomeCountry();
  const { data: target } = useEu5SelectionTrigger<SelectionTargetData | null>((engine) =>
    engine.queries.getSelectionTarget(),
  );
  return useMemo(() => ({ home, target: target ?? null }), [home, target]);
}

const GRID = { left: 56, right: 24, top: 32, bottom: 44 };

export type SeriesOption = Exclude<NonNullable<EChartsOption["series"]>, readonly unknown[]>;
type LabelLayoutParams = {
  dataIndex?: number;
  rect: { x: number; y: number; width: number; height: number };
};

/**
 * Gives each label a place when ECharts lays out the labels. ECharts asks for
 * one label at a time, so the first ask of a layout finds all the places,
 * from the dots' positions on the chart. A label with no free place gives way.
 */
function dotLabelLayout<T>(
  dots: readonly ScatterDot<T>[],
  chart: echarts.ECharts | null,
  seriesIndex: number,
) {
  // The colored dots, in the order that their labels take a place. A colored
  // dot with no label keeps the labels off it.
  const seated = dots
    .map((dot, index) => ({ dot, index }))
    .filter(({ dot }) => dot.colored)
    .sort(
      (a, b) =>
        Number(b.dot.labeled) - Number(a.dot.labeled) ||
        Number(b.dot.marked) - Number(a.dot.marked) ||
        b.dot.point.x - a.dot.point.x,
    );
  const widths = new Map(
    seated
      .filter(({ dot }) => dot.labeled)
      .map(({ dot, index }) => [index, chartTextWidth(dot.point.country.country.name)]),
  );
  let layout: Map<number, { center: [number, number]; place: LabelRect | null }> | null = null;

  const find = () => {
    if (!chart) return null;
    const plot = {
      x: GRID.left,
      y: GRID.top,
      width: chart.getWidth() - GRID.left - GRID.right,
      height: chart.getHeight() - GRID.top - GRID.bottom,
    };
    const seats = seated.map(({ dot, index }) => {
      const pixel: unknown = chart.convertToPixel({ seriesIndex }, dot.value);
      const [x = NaN, y = NaN] = Array.isArray(pixel) ? (pixel as number[]) : [];
      const center: [number, number] = [x, y];
      const half = dot.symbolSize / 2;
      const rect = { x: x - half, y: y - half, width: dot.symbolSize, height: dot.symbolSize };
      // A dot out of the plot after a zoom has no label.
      const shown = contains(plot, { x, y, width: 0, height: 0 });
      return { index, center, rect, width: shown ? widths.get(index) : undefined };
    });
    const places = placeLabels(seats, plot);
    return new Map(
      seats.map((seat, i) => [seat.index, { center: seat.center, place: places[i]! }]),
    );
  };

  return (params: LabelLayoutParams) => {
    const index = params.dataIndex ?? -1;
    const x = params.rect.x + params.rect.width / 2;
    const y = params.rect.y + params.rect.height / 2;
    let seat = layout?.get(index);
    // A dot that moved starts a new layout.
    if (!seat || Math.hypot(seat.center[0] - x, seat.center[1] - y) > 0.5) {
      layout = find();
      seat = layout?.get(index);
    }
    const place = seat?.place;
    if (!place)
      return {
        fontSize: 0,
        labelLinePoints: [
          [x, y],
          [x, y],
        ],
      };
    const anchorX = place.x + place.width / 2 < x ? place.x + place.width : place.x;
    const anchorY = place.y + place.height / 2;
    const far = Math.hypot(anchorX - x, anchorY - y) > LEADER_RADII[0]! - 4;
    return {
      x: place.x,
      y: place.y,
      align: "left" as const,
      verticalAlign: "top" as const,
      // A label away from its dot has a line to it.
      labelLinePoints: far
        ? [
            [x, y],
            [anchorX, anchorY],
          ]
        : [
            [x, y],
            [x, y],
          ],
    };
  };
}

/** The scale of a value axis */
export interface ValueScale {
  min?: number;
  max?: number;
  formatter?: (value: number) => string;
}

interface CountryScatterProps<T> {
  rows: readonly T[];
  point: (row: T) => CountryPoint;
  /** The tooltip of a dot, in HTML */
  tooltip: (row: T) => string;
  xName: string;
  yName: string;
  /**
   * The y axis: a value axis with these settings, or "log" for the scale of
   * the x axis, so that a diagonal stays a diagonal.
   */
  yAxis?: ValueScale | "log";
  /** What a country on the 0 edge has none of */
  zeroWhat: string;
  /** Series under the dots, such as a reference line */
  under?: (domain: LogDomain) => SeriesOption[];
}

/**
 * A scatter of countries on a log x axis. A click on a dot selects its
 * country, and Shift, Ctrl or Cmd adds it.
 */
export function CountryScatter<T>({
  rows,
  point,
  tooltip,
  xName,
  yName,
  yAxis = {},
  zeroWhat,
  under,
}: CountryScatterProps<T>) {
  const marks = useScatterMarks();
  // The labels need the chart to find where the dots are.
  const [chart, setChart] = useState<echarts.ECharts | null>(null);
  const logY = yAxis === "log";

  const { domain, dots, onEdge, negative } = useMemo(() => {
    const points = rows.map(point);
    const values = points.flatMap((p) => (logY ? [p.x, p.y] : [p.x]));
    const domain = logDomain(values);
    const dots = scatterDots(rows, point, { x: domain, y: logY ? domain : undefined }, marks);
    const onEdge = points.filter((p) => !(p.x > 0) || (logY && !(p.y > 0))).length;
    return { domain, dots, onEdge, negative: domain.hasNegative };
  }, [rows, point, logY, marks]);

  const below = useMemo(() => under?.(domain) ?? [], [under, domain]);
  // The dots come after the series under them.
  const seriesIndex = below.length;

  const option = useMemo((): EChartsOption => {
    return {
      grid: GRID,
      xAxis: { ...logAxis(domain), name: xName, nameLocation: "middle", nameGap: 28 },
      yAxis:
        yAxis === "log"
          ? { ...logAxis(domain), ...yAxisName(yName) }
          : {
              type: "value",
              min: yAxis.min,
              max: yAxis.max,
              // An undefined key would hide the theme's tick text.
              ...(yAxis.formatter && { axisLabel: { formatter: yAxis.formatter } }),
              ...yAxisName(yName),
            },
      // No filter on a zoom, so each dot keeps its index.
      dataZoom: [{ type: "inside", xAxisIndex: 0, yAxisIndex: 0, filterMode: "none" }],
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params) || params.seriesIndex !== seriesIndex) return "";
          const dot = dots[params.dataIndex];
          return dot ? tooltip(dot.row) : "";
        },
      },
      series: [
        ...below,
        {
          type: "scatter",
          data: dots.map((dot) => ({
            value: dot.value,
            symbolSize: dot.symbolSize,
            label: { show: dot.labeled },
            itemStyle: dot.colored
              ? { ...dotRim, color: dot.point.country.colorHex || neutralMark, opacity: 1 }
              : undefined,
          })),
          itemStyle: { color: neutralMark, opacity: 0.4, borderWidth: 0 },
          label: {
            ...chartText,
            ...labelHalo,
            formatter: (params) => dots[params.dataIndex]?.point.country.country.name ?? "",
          },
          labelLine: { show: true, lineStyle: { color: chartInk.muted, width: 1 } },
          labelLayout: dotLabelLayout(dots, chart, seriesIndex),
        },
      ],
    };
  }, [domain, dots, below, seriesIndex, chart, xName, yName, yAxis, tooltip]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getTarget: (params) => {
      const dot = params.seriesIndex === seriesIndex ? dots[params.dataIndex] : undefined;
      if (!dot) return null;
      const { country } = dot.point;
      return {
        id: country.country.key,
        anchorLocationIdx: country.anchorLocationIdx,
        label: country.country.name,
      };
    },
  });

  const unnamedPlayers = dots.some((dot) => dot.colored && !dot.labeled);

  return (
    <>
      <EChart
        option={option}
        style={{ height: "420px", width: "100%" }}
        onInit={(instance) => {
          setChart(instance);
          handleInit(instance);
        }}
      />
      {unnamedPlayers ? (
        <p className="mt-1 text-[12px] text-game-ink-500">
          Colored dots are players. Hover a dot to see its name.
        </p>
      ) : null}
      <LogFloorNote
        count={onEdge}
        noun={{ one: "country", many: "countries" }}
        what={zeroWhat}
        negative={negative}
        edge={logY ? "edges" : "left edge"}
      />
    </>
  );
}
