import { formatInt, formatTick } from "@/lib/format";
import {
  chartInk,
  chartNumberText,
  getEChartsTheme,
  neutralMark,
} from "@/components/viz/echartsTheme";
import type { CountryRef } from "@/wasm/wasm_eu5";
import { displayTag } from "../../stack/selection";
import { useEu5Players } from "../../store";

/** The largest countries that have a label on a scatter, by the x value */
const TOP_LABELS = 5;

/** Space after the largest value on a log axis, so that its label and its You mark stay in the chart */
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

/** The mark of the player's own dot. A multiplayer save does not tell which player reads it. */
const playerMark = (multiplayer: boolean) => (multiplayer ? "Player" : "You");

interface DotSource {
  x: number;
  y: number;
  tag: string;
  name: string;
  color: string | null | undefined;
  player?: boolean;
}

/** The light ring on a dot in its game colour, so that a dark colour shows on the panel */
const DOT_RING = { borderColor: "rgba(255, 255, 255, 0.85)", borderWidth: 1.25 } as const;

/**
 * The dots of a scatter of countries. Most dots have one muted neutral colour,
 * because hue on hundreds of dots shows no pattern. The player, the selected
 * countries, and the five largest have their game colour, a ring, and a label.
 * They come last, so they are on top of the other dots. The highest come first
 * among them: a label stands over its dot, so only a dot higher up can be in its
 * way, and the label placement then knows that dot.
 */
export function scatterDots<T extends DotSource>(
  rows: readonly T[],
  domain: LogDomain,
  selected: readonly CountryRef[],
  multiplayer = false,
) {
  const largest = [...rows].sort((a, b) => b.x - a.x).slice(0, TOP_LABELS);
  const labelled = new Set([...largest.map((r) => r.tag), ...selected.map((c) => c.tag)]);
  const isHighlighted = (row: T) => row.player === true || labelled.has(row.tag);
  return rows
    .map((row) => {
      const highlighted = isHighlighted(row);
      return {
        ...row,
        value: [logPosition(row.x, domain), row.y] as [number, number],
        dotLabel: row.player
          ? `${dotLabel(row.tag, row.name)} ${playerMark(multiplayer)}`
          : dotLabel(row.tag, row.name),
        label: { show: highlighted },
        ...(highlighted
          ? {
              symbolSize: 10,
              itemStyle: { ...DOT_RING, color: row.color || neutralMark, opacity: 1 },
            }
          : {}),
      };
    })
    .sort((a, b) => Number(a.label.show) - Number(b.label.show) || (a.label.show ? b.y - a.y : 0));
}

interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlaps = (a: LabelRect, b: LabelRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The size of a labelled dot, and the place of its label over the dot */
const LABELLED_DOT = 10;
const LABEL_GAP = 4;
const LABEL_HEIGHT = 13;
const LABEL_CHAR_WIDTH = 6.6;

/**
 * The offset of a label from its place over its dot, so that it overlaps no
 * label or labelled dot in `placed`. It tries each side of the dot, then goes
 * higher in steps, so a place is always found and no label is hidden.
 */
export function labelOffset(rect: LabelRect, dot: LabelRect, placed: readonly LabelRect[]) {
  const below = dot.height + rect.height + LABEL_GAP * 2;
  const beside = rect.width / 2 + dot.width / 2 + 3;
  const sideY = dot.height / 2 + rect.height / 2 + LABEL_GAP;
  const candidates: [number, number][] = [
    [0, 0],
    [beside, sideY],
    [-beside, sideY],
    [0, below],
  ];
  for (let step = 1; step < 40; step += 1) candidates.push([0, -step * (rect.height + 1)]);
  for (const [dx, dy] of candidates) {
    const moved = { ...rect, x: rect.x + dx, y: rect.y + dy };
    if (!placed.some((other) => overlaps(moved, other))) return { dx, dy };
  }
  return { dx: 0, dy: 0 };
}

/**
 * The series of a scatter of countries. The neutral dots are muted, under the
 * highlighted dots. ECharts gives a label its layout during the dots' enter
 * animation, when the sizes that it reports are still zero, so only the dot's
 * centre comes from ECharts, and the sizes come from the text.
 */
export function countryDotSeries() {
  let placed: LabelRect[] = [];
  const seen = new Set<number>();
  return {
    type: "scatter" as const,
    symbolSize: 7,
    itemStyle: { color: neutralMark, opacity: 0.4, borderWidth: 0 },
    label: {
      ...chartNumberText,
      color: chartInk.primary,
      position: "top" as const,
      distance: LABEL_GAP,
      formatter: (params: { data?: unknown }) =>
        (params.data as { dotLabel?: string } | undefined)?.dotLabel ?? "",
    },
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
      const label = {
        x: x - width / 2,
        y: dot.y - LABEL_GAP - LABEL_HEIGHT,
        width,
        height: LABEL_HEIGHT,
      };
      const offset = labelOffset(label, dot, placed);
      placed.push(dot, { ...label, x: label.x + offset.dx, y: label.y + offset.dy });
      return offset;
    },
  };
}

/** Says why some dots have a label, and how many dots are on the left edge of a log axis */
export function LogFloorNote({ domain, what }: { domain: LogDomain; what: string }) {
  const multiplayer = useEu5Players().length > 1;
  return (
    <div className="mt-1 text-[12px] text-game-ink-500">
      <p>
        Labelled: {multiplayer ? "players" : "You"}, selection and top {TOP_LABELS} by total
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
