import { getEChartsTheme } from "@/components/viz/echartsTheme";

/** The bin edges of a histogram, from the left edge of the first bin to the right edge of the last */
export function binEdges(buckets: readonly { lo: number; hi: number }[]): number[] {
  if (buckets.length === 0) return [];
  return [...buckets.map((b) => b.lo), buckets[buckets.length - 1].hi];
}

const isMultiple = (value: number, of: number) => {
  const ratio = value / of;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
};

/** The round steps to test, from the smallest step that an edge can have */
function roundSteps(edges: readonly number[]): number[] {
  const largest = Math.max(...edges.map(Math.abs), 1);
  const first = Math.floor(Math.log10(largest)) - 3;
  return Array.from({ length: 5 }, (_, i) => first + i).flatMap((power) =>
    [1, 2, 2.5, 5].map((m) => m * 10 ** power),
  );
}

/**
 * The positions of the edges that have a label: the fewest round numbers that
 * still give two labels, with `maxLabels` as the limit. Position `i` is the
 * left edge of bin `i`. Bins on a 1-2-5 ladder have no common round step, so
 * they take each power of 10.
 */
export function roundEdgePositions(edges: readonly number[], maxLabels = 6): number[] {
  const positions = edges.map((_, i) => i);
  if (edges.length <= maxLabels) return positions;

  const gaps = edges.slice(1).map((edge, i) => edge - edges[i]);
  const uniform = gaps.every((gap) => Math.abs(gap - gaps[0]) <= Math.abs(gaps[0]) * 1e-6);
  if (uniform) {
    for (const step of roundSteps(edges)) {
      if (!isMultiple(gaps[0], step) && !isMultiple(step, gaps[0])) continue;
      const round = positions.filter((i) => isMultiple(edges[i], step));
      if (round.length >= 2 && round.length <= maxLabels) return round;
    }
  } else {
    const decades = positions.filter(
      (i) => edges[i] === 0 || isMultiple(Math.log10(Math.abs(edges[i])), 1),
    );
    if (decades.length >= 2 && decades.length <= maxLabels) return decades;
  }

  const stride = Math.ceil(edges.length / maxLabels);
  return positions.filter((i) => i % stride === 0);
}

/** The width of one character of a chart's number text: the mono at 12px */
const NUMBER_CHAR_WIDTH = 7.2;
/** The space that stays between two labels on one row, in px */
const LABEL_GAP = 6;

/**
 * Where the median and p90 labels of a histogram go. The value `align` is the
 * text's edge that is on the line: "right" puts the text before the line. The
 * median's text ends on its line and the p90's text starts on its line, so the
 * two go apart and stay on one row. A label that does not fit in the chart goes
 * to the other side of its line. The labels have two rows only when they then
 * overlap.
 */
export function histogramLabels({
  median,
  p90,
  plotWidth,
  gutter,
}: {
  /** `at` is the position of the line, from 0 to 1 across the plot */
  median: { at: number; chars: number };
  p90: { at: number; chars: number };
  plotWidth: number;
  gutter: { left: number; right: number };
}): { median: "left" | "right"; p90: "left" | "right"; stacked: boolean } {
  const medianX = median.at * plotWidth;
  const p90X = p90.at * plotWidth;
  const medianWidth = median.chars * NUMBER_CHAR_WIDTH;
  const p90Width = p90.chars * NUMBER_CHAR_WIDTH;
  const medianAlign = medianX - medianWidth >= -gutter.left ? "right" : "left";
  const p90Align = p90X + p90Width <= plotWidth + gutter.right ? "left" : "right";
  // Labels that go apart have their lines between them, so only other pairs can overlap.
  const apart = medianAlign === "right" && p90Align === "left";
  const medianEnd = medianAlign === "right" ? medianX : medianX + medianWidth;
  const p90Start = p90Align === "left" ? p90X : p90X - p90Width;
  return {
    median: medianAlign,
    p90: p90Align,
    stacked: !apart && medianEnd + LABEL_GAP > p90Start,
  };
}

/**
 * The round years in a span, as offsets from the save's year. A chart's history
 * starts on the year of the campaign's start (1337), so ticks counted from the
 * ends would show 1382 and 1432.
 */
export function roundYearOffsets(firstOffset: number, baseYear: number, maxLabels = 6): number[] {
  const first = baseYear + firstOffset;
  const span = baseYear - first;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => span / s <= maxLabels) ?? 1000;
  const years: number[] = [];
  for (let year = Math.ceil(first / step) * step; year <= baseYear; year += step) {
    years.push(year - baseYear);
  }
  return years;
}

/**
 * The two x axes of a histogram. The bars stand on a category axis with no
 * text. A value axis over the same width has the text, so that a number stands
 * on the edge between two bins. A label on a bar's centre would say that the
 * bar is at that number.
 */
export function histogramXAxes(
  buckets: readonly { lo: number; hi: number }[],
  formatEdge: (edge: number) => string,
  name?: string,
) {
  const { axisColor, tickColor } = getEChartsTheme();
  const edges = binEdges(buckets);
  const positions = roundEdgePositions(edges).filter(
    (position, i, all) => i === 0 || edges[position] !== edges[all[i - 1]],
  );
  return [
    {
      type: "category" as const,
      data: buckets.map((_, i) => i),
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: axisColor } },
    },
    {
      type: "value" as const,
      position: "bottom" as const,
      min: 0,
      max: buckets.length,
      name,
      nameLocation: "middle" as const,
      nameGap: 26,
      nameTextStyle: { color: tickColor, fontSize: 12 },
      axisLabel: {
        color: tickColor,
        customValues: positions,
        formatter: (position: number) => formatEdge(edges[position] ?? 0),
      },
      axisTick: {
        show: true,
        customValues: positions,
        lineStyle: { color: axisColor },
      },
      axisLine: { show: false },
      splitLine: { show: false },
      axisPointer: { show: false },
    },
  ];
}
