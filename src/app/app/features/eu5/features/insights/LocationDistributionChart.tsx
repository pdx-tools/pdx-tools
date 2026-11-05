import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartGutter,
  chartNumberText,
  chartTooltip,
  getEChartsTheme,
  histogramBar,
  selectionColor,
} from "@/components/viz/echartsTheme";
import type { DistributionBucket, LocationDistribution } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt, formatMetric, formatTick } from "@/lib/format";
import { SectionTitle } from "../../components";
import { useChartExport } from "../../stack/chartExport";
import { useFullView } from "../../stack/fullView";
import { histogramLabels, histogramXAxes } from "./histogramAxis";

const COLUMN_HEIGHT = 188;
/** In a full view the histogram stands beside a scatter, so it has the scatter's height. */
const FULL_HEIGHT = "max(420px, 56vh)";

function formatBound(v: number): string {
  return Number.isInteger(v) ? String(v) : formatFloat(v, 1);
}

/** A bucket of one value, such as the zero bucket of a log ladder, is one number. */
function formatBucket(b: DistributionBucket): string {
  return b.lo === b.hi ? formatBound(b.lo) : `${formatBound(b.lo)}-${formatBound(b.hi)}`;
}

/**
 * Where a metric value falls on the category axis. Category `i` is centred
 * at `i`, so its bucket spans `i - 0.5` to `i + 0.5`; the value sits a
 * fraction of the way across the bucket that holds it.
 */
function bucketCoord(buckets: DistributionBucket[], value: number): number | null {
  const last = buckets.length - 1;
  if (last < 0) return null;
  const i = buckets.findIndex((b, idx) => value < b.hi || idx === last);
  const b = buckets[i];
  if (!b) return null;
  const span = b.hi - b.lo;
  const t = span > 0 ? Math.min(1, Math.max(0, (value - b.lo) / span)) : 0.5;
  return i - 0.5 + t;
}

interface Props {
  distribution: LocationDistribution;
  /** Replaces the default section title, the metric's name. */
  title?: string;
}

export function LocationDistributionChart({ distribution, title }: Props) {
  const heading = `${title ?? distribution.metricLabel} · locations per band`;
  const chartImage = useChartExport(heading);
  const full = useFullView().on;
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const measure = () => setChartWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { buckets, median, p90 } = distribution;
  const medianName = `median ${formatMetric(median)}`;
  const p90Name = `p90 ${formatMetric(p90)}`;
  const medianCoord = bucketCoord(buckets, median);
  const p90Coord = bucketCoord(buckets, p90);
  const at = (coord: number | null) => ((coord ?? 0) + 0.5) / Math.max(1, buckets.length);
  // A new width changes the chart only when it moves a label.
  const labels = histogramLabels({
    median: { at: at(medianCoord), chars: medianName.length },
    p90: { at: at(p90Coord), chars: p90Name.length },
    plotWidth: Math.max(0, chartWidth - chartGutter.left - chartGutter.right),
    gutter: chartGutter,
  });
  const { median: medianAlign, p90: p90Align, stacked } = labels;

  const option = useMemo<EChartsOption>(() => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    // Median and p90 land on the shape the bars draw, and each label has the value, so the
    // reader sees where the middle and the tail begin.
    const data = [
      { name: medianName, xAxis: medianCoord, align: medianAlign, offset: stacked ? -13 : 0 },
      { name: p90Name, xAxis: p90Coord, align: p90Align, offset: 0 },
    ].flatMap(({ name, xAxis, align, offset }) =>
      xAxis == null ? [] : [{ name, xAxis: xAxis + 0.5, label: { align, offset: [0, offset] } }],
    );
    return {
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const p = (params as { dataIndex: number; value: number }[])[0];
          if (!p) return "";
          const b = buckets[p.dataIndex];
          if (!b) return "";
          return `${formatBucket(b)}: ${formatInt(p.value)} locations`;
        },
      },
      xAxis: histogramXAxes(buckets, formatTick),
      yAxis: {
        type: "value",
        // The top tick would stand under the labels of the median and p90.
        axisLabel: { color: tickColor, showMaxLabel: false },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { color: gridLineColor } },
        minInterval: 1,
      },
      series: [
        {
          type: "bar",
          data: buckets.map((b) => b.count),
          itemStyle: { color: histogramBar },
          barCategoryGap: "10%",
        },
        // The lines stand on the axis of values, so each is at its true place in its band.
        // On the axis of bands a line would go to the middle of a band.
        {
          type: "line",
          xAxisIndex: 1,
          data: [],
          silent: true,
          markLine: {
            symbol: "none",
            silent: true,
            animation: false,
            data,
            // At 2px the brass stays brass in an image with subsampled colour, such as a shared
            // screenshot. There a line of 1px on an odd pixel column loses its colour and looks white.
            lineStyle: { type: "dashed", color: selectionColor, width: 2 },
            label: {
              ...chartNumberText,
              position: "end",
              formatter: "{b}",
            },
          },
        },
      ],
      // The band over the plot holds two rows of labels, so a change of rows does not move the plot.
      grid: { ...chartGutter, top: 46, bottom: 24 },
    };
  }, [buckets, medianName, p90Name, medianCoord, p90Coord, medianAlign, p90Align, stacked]);

  if (buckets.length === 0) return null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <SectionTitle>{heading}</SectionTitle>
        {chartImage.button}
      </div>
      <div ref={chartRef}>
        <EChart
          option={option}
          style={{ height: full ? FULL_HEIGHT : COLUMN_HEIGHT }}
          onInit={chartImage.track}
        />
      </div>
    </div>
  );
}
