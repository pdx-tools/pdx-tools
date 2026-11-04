import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartTooltip,
  getEChartsTheme,
  histogramBar,
  chartGutter,
  yAxisName,
} from "@/components/viz/echartsTheme";
import type { CountryUnrealizedTaxBase } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { histogramXAxes } from "./histogramAxis";

const BUCKET_WIDTH = 5;
const MAX_BUCKET = 100;

export function RealizationHistogram({ countries }: { countries: CountryUnrealizedTaxBase[] }) {
  const { buckets, zeroWealthCount } = useMemo(() => {
    const ratios = countries
      .filter((c) => c.totalWealth > 0)
      .map((c) => c.realizationRatio)
      .filter((v) => Number.isFinite(v));
    const nextBuckets = Array.from({ length: MAX_BUCKET / BUCKET_WIDTH }, (_, i) => ({
      lo: i * BUCKET_WIDTH,
      hi: (i + 1) * BUCKET_WIDTH,
      count: 0,
    }));

    for (const ratio of ratios) {
      const pct = Math.min(MAX_BUCKET, Math.max(0, ratio * 100));
      const idx = Math.min(Math.floor(pct / BUCKET_WIDTH), nextBuckets.length - 1);
      nextBuckets[idx].count += 1;
    }

    return {
      // Each bin stays, also an empty one, because a gap in the bars is a fact.
      buckets: nextBuckets,
      zeroWealthCount: countries.length - ratios.length,
    };
  }, [countries]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    return {
      grid: { ...chartGutter, top: 28, bottom: 45 },
      xAxis: histogramXAxes(buckets, (edge) => `${formatInt(edge)}%`, "Realization"),
      yAxis: {
        type: "value",
        ...yAxisName("Countries"),
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
        minInterval: 1,
      },
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as { lo: number; hi: number; value: number };
          return [
            `Realization: ${formatInt(d.lo)}-${formatInt(d.hi)}%`,
            `Countries: ${formatInt(d.value)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "bar",
          data: buckets.map((b) => ({ ...b, value: b.count })),
          itemStyle: { color: histogramBar },
        },
      ],
    };
  }, [buckets]);

  return (
    <div>
      <EChart option={option} style={{ height: "260px", width: "100%" }} />
      {zeroWealthCount > 0 && (
        <p className="mt-1 text-xs text-game-ink-500">
          {formatInt(zeroWealthCount)} countries with zero wealth excluded.
        </p>
      )}
    </div>
  );
}
