import { useCallback, useRef } from "react";
import { formatInt, formatTick } from "@/lib/format";
import {
  chartGutter,
  chartInk,
  chartNumberText,
  getEChartsTheme,
  neutralMark,
} from "@/components/viz/echartsTheme";
import type { CountryRef } from "@/wasm/wasm_eu5";
import { displayTag } from "../../stack/selection";
import { useEu5HomeCountry, useEu5Players, useEu5SelectionState } from "../../store";
import { useFullView } from "../../stack/fullView";
import { useSelectedCountries } from "../../stack/selected";

/** The largest countries that have a label on a scatter, by the x value */
const TOP_LABELS = 5;

/** Space after the largest value on a log axis, so that a label stays in the chart */
const LOG_HEADROOM = 3;

export interface LogDomain {
  /** The left end of the axis: a power of 10 at or under the smallest value above zero */
  floor: number;
  /** The right end of the axis */
  ceiling: number;
  /** The number of values at zero or under. Each one is plotted on `floor`. */
  onFloor: number;
  /** Some values are under zero, so the floor's tick is not "0" */
  hasNegative: boolean;
}

/**
 * The extent of a log axis. A log axis has no place for a value at zero or
 * under, and ECharts would drop that value with no message. Such a value goes
 * on the left edge, one decade under the smallest real value, so that it is
 * apart from them. The edge's tick says "0", a note under the chart gives the
 * count, and the tooltip keeps the real value.
 */
export function logDomain(values: readonly number[]): LogDomain {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  const onFloor = values.length - positive.length;
  const decade = positive.length > 0 ? Math.floor(Math.log10(Math.min(...positive))) : 0;
  const largest = positive.length > 0 ? Math.max(...positive) : 10;
  return {
    floor: 10 ** (onFloor > 0 ? decade - 1 : decade),
    ceiling: largest * LOG_HEADROOM,
    onFloor,
    hasNegative: values.some((v) => v < 0),
  };
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

/** A log axis with the name under it. For a y axis, `yAxisName` gives the one rule. */
export function logAxis(domain: LogDomain, name: string, nameGap = 28) {
  const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
  return {
    type: "log" as const,
    name,
    nameLocation: "middle" as const,
    nameGap,
    nameTextStyle: { color: tickColor, fontSize: 12 },
    min: domain.floor,
    max: domain.ceiling,
    axisLabel: {
      color: tickColor,
      hideOverlap: true,
      // The ends of the axis are not powers of 10, so they have no tick text.
      showMaxLabel: false,
      formatter: (value: number) => logTick(value, domain),
    },
    axisLine: { lineStyle: { color: axisColor } },
    splitLine: {
      lineStyle: { type: "dashed" as const, color: gridLineColor, opacity: 0.5, width: 1 },
    },
  };
}

/** The name on a dot: the tag, or the name when the tag is generated, such as AAA67 */
export function dotLabel(tag: string, name: string): string {
  return displayTag(tag) ?? name;
}

interface DotSource {
  x: number;
  y: number;
  tag: string;
  name: string;
  color: string | null | undefined;
  player?: boolean;
  id?: number;
  /** What "largest" means, when the x axis is not the total */
  size?: number;
}

/** The light ring on a dot in its game colour, so that a dark colour shows on the panel */
const DOT_RING = { borderColor: "rgba(255, 255, 255, 0.85)", borderWidth: 1.25 } as const;

/** The size of a dot that has its colour, and of one with a label */
const COLOURED_DOT = 8;
const LABELLED_DOT = 10;

/**
 * The dots of a scatter of countries. Most dots have one muted neutral colour,
 * because hue on hundreds of dots shows no pattern. The players have their game
 * colour and a ring. The save's own country, the selected countries, and the five
 * largest also have a label. Each label is the country's name, and a label that finds
 * no free place gives way, so that labels never collide. A label does not name a
 * player: the pointer gives that, and so does the list.
 *
 * The labelled dots come last, so they are on top, and the most important of them
 * come first among themselves, because they choose their place first.
 */
export function scatterDots<T extends DotSource>(
  rows: readonly T[],
  domain: LogDomain,
  selected: readonly CountryRef[],
  home?: number,
  /** Name each player: the frame has the room, or the players are the subject */
  namePlayers = false,
) {
  // With players on the chart, the group wants to find itself first.
  const players = rows.filter((r) => r.player);
  const largest = [...(players.length > 1 ? players : rows)]
    .sort((a, b) => (b.size ?? b.x) - (a.size ?? a.x))
    .slice(0, TOP_LABELS)
    .map((r) => r.tag);
  const chosen = new Set(selected.map((c) => c.tag));
  const important = (row: T) => (home !== undefined && row.id === home) || chosen.has(row.tag);
  const span = Math.log(domain.ceiling) - Math.log(domain.floor);
  const dots = rows.map((row) => {
    const labelled =
      important(row) || largest.includes(row.tag) || (namePlayers && row.player === true);
    const coloured = labelled || row.player === true;
    const at = logPosition(row.x, domain);
    return {
      ...row,
      value: [at, row.y] as [number, number],
      dotLabel: row.name,
      // The share of the axis, so a label near the end can go the other way.
      across: span > 0 ? (Math.log(at) - Math.log(domain.floor)) / span : 0,
      label: { show: labelled },
      ...(coloured
        ? {
            symbolSize: labelled ? LABELLED_DOT : COLOURED_DOT,
            itemStyle: { ...DOT_RING, color: row.color || neutralMark, opacity: 1 },
          }
        : {}),
    };
  });
  const weight = (dot: (typeof dots)[number]) =>
    dot.label.show ? (important(dot as unknown as T) ? 3 : 2) : dot.itemStyle ? 1 : 0;
  return dots.sort((a, b) => weight(a) - weight(b));
}

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Labels keep this much space between them */
const LABEL_SPACE = 3;

const overlaps = (a: LabelRect, b: LabelRect) =>
  a.x < b.x + b.width + LABEL_SPACE &&
  b.x < a.x + a.width + LABEL_SPACE &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const LABEL_GAP = 4;
const LABEL_HEIGHT = 13;
const LABEL_CHAR_WIDTH = 6.6;

/**
 * Where a label goes around its dot: the first of the near places that overlaps
 * nothing in `placed`, or null when each one does. A label that has no place gives
 * way, because a label far from its dot names nothing. `across` is where the dot is on
 * the x axis: past the middle of the plot a label reads back into the plot.
 */
export function labelPlace(
  dot: LabelRect,
  width: number,
  height: number,
  placed: readonly LabelRect[],
  across = 0,
  /** The plot, so that a label stays in it */
  bounds?: LabelRect,
): LabelRect | null {
  const centerY = dot.y + dot.height / 2 - height / 2;
  const right = { x: dot.x + dot.width + LABEL_GAP, y: centerY, width, height };
  const left = { x: dot.x - LABEL_GAP - width, y: centerY, width, height };
  const above = {
    x: dot.x + dot.width / 2 - width / 2,
    y: dot.y - LABEL_GAP - height,
    width,
    height,
  };
  const below = {
    x: dot.x + dot.width / 2 - width / 2,
    y: dot.y + dot.height + LABEL_GAP,
    width,
    height,
  };
  const near = across > 0.7 ? [left, above, below] : [right, above, below, left];
  // Farther places need a leader line, so they come last.
  const far = [28, 52].flatMap((radius) =>
    [-0.8, 0.8, -0.3, 0.3, Math.PI - 0.8, Math.PI + 0.8, Math.PI - 0.3, Math.PI + 0.3].map(
      (angle) => ({
        x: dot.x + dot.width / 2 + Math.cos(angle) * radius - (Math.cos(angle) < 0 ? width : 0),
        y: dot.y + dot.height / 2 + Math.sin(angle) * radius - height / 2,
        width,
        height,
      }),
    ),
  );
  const inside = (rect: LabelRect) =>
    !bounds ||
    (rect.x >= bounds.x &&
      rect.y >= bounds.y &&
      rect.x + rect.width <= bounds.x + bounds.width &&
      rect.y + rect.height <= bounds.y + bounds.height);
  return (
    [...near, ...far].find(
      (rect) => inside(rect) && !placed.some((other) => overlaps(rect, other)),
    ) ?? null
  );
}

/**
 * The series of a scatter of countries. The neutral dots are muted, under the
 * coloured dots. ECharts gives a label its layout during the dots' enter animation,
 * when the sizes that it reports are still zero, so only the dot's centre comes
 * from ECharts, and the sizes come from the text.
 */
export function countryDotSeries<T extends { across?: number; label: { show: boolean } }>(
  data: readonly T[],
  plot?: () => LabelRect | undefined,
) {
  let placed: LabelRect[] = [];
  const seen = new Set<number>();
  return {
    type: "scatter" as const,
    data: data as T[],
    symbolSize: 7,
    itemStyle: { color: neutralMark, opacity: 0.4, borderWidth: 0 },
    label: {
      ...chartNumberText,
      color: chartInk.primary,
      // A halo keeps a name readable over the dots of a crowded plot.
      textBorderColor: chartInk.surface,
      textBorderWidth: 3,
      position: "top" as const,
      distance: LABEL_GAP,
      formatter: (params: { data?: unknown }) =>
        (params.data as { dotLabel?: string } | undefined)?.dotLabel ?? "",
    },
    labelLine: { show: true, lineStyle: { color: chartInk.muted, width: 1 } },
    labelLayout: (params: { dataIndex?: number; text: string; rect: LabelRect }) => {
      // ECharts lays out the labels in data order. A dot seen before starts a new pass.
      const index = params.dataIndex ?? 0;
      if (seen.has(index)) {
        seen.clear();
        placed = [];
      }
      seen.add(index);
      const x = params.rect.x + params.rect.width / 2;
      const y = params.rect.y + params.rect.height / 2;
      const half = LABELLED_DOT / 2;
      const dot = { x: x - half, y: y - half, width: LABELLED_DOT, height: LABELLED_DOT };
      const width = params.text.length * LABEL_CHAR_WIDTH + 2;
      const place = labelPlace(
        dot,
        width,
        LABEL_HEIGHT,
        placed,
        data[index]?.across ?? 0,
        plot?.(),
      );
      placed.push(dot);
      if (!place) return { fontSize: 0 };
      placed.push(place);
      // The offset is from the place over the dot, which is where ECharts puts a label.
      const centerX = place.x + width / 2;
      const centerY = place.y + LABEL_HEIGHT / 2;
      const far = Math.hypot(centerX - x, centerY - y) > width / 2 + 16;
      return {
        dx: centerX - x,
        dy: centerY - (dot.y - LABEL_GAP - LABEL_HEIGHT / 2),
        // A label away from its dot has a leader line to it.
        labelLinePoints: far
          ? [
              [x, y],
              [centerX < x ? place.x + width : place.x, centerY],
            ]
          : [
              [x, y],
              [x, y],
            ],
      };
    },
  };
}

/** The countries that a scatter of countries must mark */
export function useScatterMarks() {
  const chart = useRef<{ getWidth: () => number; getHeight: () => number } | null>(null);
  const selection = useEu5SelectionState();
  const full = useFullView().on;
  const plot = useCallback((): LabelRect | undefined => {
    if (!chart.current) return undefined;
    const { left, right } = chartGutter;
    return {
      x: left,
      y: 0,
      width: chart.current.getWidth() - left - right,
      height: chart.current.getHeight(),
    };
  }, []);
  return {
    selected: useSelectedCountries(),
    home: useEu5HomeCountry()?.countryIdx,
    namePlayers: full || selection?.preset === "players",
    plot,
    track: useCallback((instance: { getWidth: () => number; getHeight: () => number }) => {
      chart.current = instance;
    }, []),
  };
}

/** Says which dots have a colour and a label, as the chart draws them */
export function LogFloorNote({
  domain,
  what,
  axis,
}: {
  domain: LogDomain;
  what: string;
  /** The sentence that reads the two axes */
  axis?: string;
}) {
  const multiplayer = useEu5Players().length > 1;
  const home = useEu5HomeCountry();
  return (
    <div className="mt-1 text-[12px] leading-snug text-game-ink-500">
      {axis ? <p>{axis}</p> : null}
      <p>
        {multiplayer ? "Coloured: the players. " : ""}Labelled:{" "}
        {home ? (home.kind === "player" ? "your country, " : "the viewed country, ") : ""}the
        selection and the top {TOP_LABELS} {multiplayer ? "players" : "countries"} by total.{" "}
        {multiplayer ? "The Players scope and the full view name each player. " : ""}The pointer
        names each dot.
      </p>
      {domain.onFloor > 0 ? (
        <p>
          {formatInt(domain.onFloor)} {domain.onFloor === 1 ? "country" : "countries"} with no{" "}
          {what} at the left edge.
        </p>
      ) : null}
    </div>
  );
}
