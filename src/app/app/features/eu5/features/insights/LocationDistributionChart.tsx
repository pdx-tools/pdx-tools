import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartInk,
  chartTooltip,
  getEChartsTheme,
  seriesColor,
} from "@/components/viz/echartsTheme";
import type { DistributionBucket, LocationDistribution } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { SectionTitle } from "../../components";

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
  /** Replaces the default "<metric> distribution" section title. */
  title?: string;
}

export function LocationDistributionChart({ distribution, title }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const { buckets, median, p90 } = distribution;
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    // Median and p90 land on the shape the bars draw, so the reader sees
    // where the middle and the tail begin without holding a number.
    const marks = [
      { name: "median", value: median },
      { name: "p90", value: p90 },
    ].flatMap(({ name, value }) => {
      const xAxis = bucketCoord(buckets, value);
      // ECharts replaces a mark's `value` with its axis coordinate, so the
      // label text is set here, not in the formatter.
      return xAxis == null ? [] : [{ name: `${name} ${formatBound(value)}`, xAxis }];
    });
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
      xAxis: {
        type: "category",
        data: buckets.map(formatBucket),
        axisLabel: { rotate: 35, color: tickColor, fontSize: 10 },
        axisLine: { lineStyle: { color: axisColor } },
      },
      yAxis: {
        type: "value",
        name: "Locations",
        nameTextStyle: { color: chartInk.secondary, fontSize: 10 },
        axisLabel: { color: tickColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridLineColor } },
        minInterval: 1,
      },
      series: [
        {
          type: "bar",
          data: buckets.map((b) => b.count),
          itemStyle: { color: seriesColor(0) },
          barCategoryGap: "10%",
          markLine: {
            symbol: "none",
            silent: true,
            animation: false,
            data: marks,
            lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
            label: {
              color: tickColor,
              fontSize: 10,
              position: "end",
              formatter: "{b}",
            },
          },
        },
      ],
      grid: { left: 50, right: 20, top: 30, bottom: 70 },
    };
  }, [distribution]);

  if (distribution.buckets.length === 0) return null;

  return (
    <div>
      <SectionTitle className="mb-1">
        {title ?? `${distribution.metricLabel} distribution`}
      </SectionTitle>
      <EChart option={option} style={{ height: 180 }} />
    </div>
  );
}
