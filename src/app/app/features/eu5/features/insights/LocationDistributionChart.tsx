import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartInk,
  chartTooltip,
  getEChartsTheme,
  seriesColor,
} from "@/components/viz/echartsTheme";
import type { LocationDistribution } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";

function formatBound(v: number): string {
  return Number.isInteger(v) ? String(v) : formatFloat(v, 1);
}

interface Props {
  distribution: LocationDistribution;
}

export function LocationDistributionChart({ distribution }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const { buckets } = distribution;
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    return {
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const p = (params as { dataIndex: number; value: number }[])[0];
          if (!p) return "";
          const b = buckets[p.dataIndex];
          if (!b) return "";
          return `${formatBound(b.lo)} - ${formatBound(b.hi)}: ${formatInt(p.value)} locations`;
        },
      },
      xAxis: {
        type: "category",
        data: buckets.map((b) => `${formatBound(b.lo)}-${formatBound(b.hi)}`),
        axisLabel: { rotate: 35, color: tickColor, fontSize: 10 },
        axisLine: { lineStyle: { color: axisColor } },
      },
      yAxis: {
        type: "value",
        name: "Locations",
        nameTextStyle: { color: chartInk.muted, fontSize: 10 },
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
        },
      ],
      grid: { left: 50, right: 20, top: 30, bottom: 70 },
    };
  }, [distribution]);

  if (distribution.buckets.length === 0) return null;

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
        {distribution.metricLabel} distribution
      </p>
      <EChart option={option} style={{ height: 180 }} />
    </div>
  );
}
