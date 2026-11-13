import { useCallback, useMemo, useState } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartInk,
  chartNumberText,
  chartTooltip,
  neutralMark,
} from "@/components/viz/echartsTheme";
import type { DistributionBucket, LocationDistribution } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { formatExact, formatMetric, formatTick } from "../../numberFormatting";
import { SectionTitle } from "../../components";
import { binCoord, histogramLabels, histogramXAxes, LABEL_PAD } from "./histogramAxis";

const GUTTER = { left: 50, right: 20 };
/** The height of one row of labels over the plot */
const LABEL_ROW = 14;

/** A bucket of one value, such as the zero bucket of a log ladder, is one number. */
function formatBucket(b: DistributionBucket): string {
  return b.lo === b.hi ? formatExact(b.lo) : `${formatExact(b.lo)} to ${formatExact(b.hi)}`;
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/** The width in px of a label in the number text of a chart */
function labelWidth(text: string): number {
  if (typeof document !== "undefined") {
    measureContext ??= document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return text.length * chartNumberText.fontSize * 0.6;
  measureContext.font = `${chartNumberText.fontSize}px ${chartNumberText.fontFamily}`;
  return measureContext.measureText(text).width;
}

/** The width of the element that gets the ref, also after it changes */
function useWidth() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Props {
  distribution: LocationDistribution;
  /** Replaces the default section title, "Locations by <metric>". */
  title?: string;
}

export function LocationDistributionChart({ distribution, title }: Props) {
  const { buckets, median, p90 } = distribution;
  const [chartRef, chartWidth] = useWidth();

  const medianName = `median ${formatMetric(median)}`;
  const p90Name = `p90 ${formatMetric(p90)}`;
  const medianCoord = binCoord(buckets, median);
  const p90Coord = binCoord(buckets, p90);
  const at = (coord: number | null) => (coord ?? 0) / Math.max(1, buckets.length);
  // A new width changes the chart only when it moves a label.
  const {
    median: medianAlign,
    p90: p90Align,
    stacked,
  } = histogramLabels({
    median: { at: at(medianCoord), width: labelWidth(medianName) },
    p90: { at: at(p90Coord), width: labelWidth(p90Name) },
    plotWidth: Math.max(0, chartWidth - GUTTER.left - GUTTER.right),
    gutter: GUTTER,
  });

  const option = useMemo<EChartsOption>(() => {
    // The median and p90 lines are on the shape of the bars, so the reader
    // sees where the middle and the tail start.
    const marks = [
      { name: medianName, xAxis: medianCoord, align: medianAlign, row: stacked ? 1 : 0 },
      { name: p90Name, xAxis: p90Coord, align: p90Align, row: 0 },
    ].flatMap(({ name, xAxis, align, row }) =>
      xAxis == null
        ? []
        : [
            {
              name,
              xAxis,
              label: {
                align,
                offset: [align === "right" ? -LABEL_PAD : LABEL_PAD, -row * LABEL_ROW] as [
                  number,
                  number,
                ],
              },
            },
          ],
    );
    return {
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const p = (params as { dataIndex: number; value: number }[])[0];
          const b = p && buckets[p.dataIndex];
          if (!b) return "";
          return `${formatBucket(b)}: ${formatInt(p.value)} locations`;
        },
      },
      xAxis: histogramXAxes(buckets, [formatTick, formatExact]),
      yAxis: {
        type: "value",
        minInterval: 1,
      },
      series: [
        {
          type: "bar",
          data: buckets.map((b) => b.count),
          itemStyle: { color: neutralMark },
          barCategoryGap: "10%",
        },
        // The lines are on the axis of values, so each is at its true place
        // in its bar. On the axis of bars, a line goes to the middle of a bar.
        {
          type: "line",
          xAxisIndex: 1,
          data: [],
          silent: true,
          markLine: {
            symbol: "none",
            silent: true,
            animation: false,
            data: marks,
            lineStyle: { type: "dashed", color: chartInk.secondary, width: 1 },
            label: { ...chartNumberText, position: "end", formatter: "{b}" },
          },
        },
      ],
      // The band over the plot holds two rows of labels, so a change of rows
      // does not move the plot.
      grid: { ...GUTTER, top: 18 + 2 * LABEL_ROW, bottom: 28 },
    };
  }, [buckets, medianName, p90Name, medianCoord, p90Coord, medianAlign, p90Align, stacked]);

  if (buckets.length === 0) return null;

  return (
    <div>
      <SectionTitle className="mb-1">
        {title ?? `Locations by ${distribution.metricLabel.toLowerCase()}`}
      </SectionTitle>
      <div ref={chartRef}>
        <EChart option={option} style={{ height: 200 }} />
      </div>
    </div>
  );
}
