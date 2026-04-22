import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryTaxGap } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";

const BUCKET_WIDTH = 5;
const MAX_BUCKET = 100;

export function RealizationHistogram({ countries }: { countries: CountryTaxGap[] }) {
  const isDark = isDarkMode();

  const { buckets, zeroPossibleCount } = useMemo(() => {
    const ratios = countries
      .filter((c) => c.totalPossibleTax > 0)
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
      buckets: nextBuckets.filter((b) => b.count > 0 || b.hi === MAX_BUCKET),
      zeroPossibleCount: countries.length - ratios.length,
    };
  }, [countries]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    return {
      grid: { left: 45, right: 20, top: 20, bottom: 45 },
      xAxis: {
        type: "category",
        name: "Realization",
        nameLocation: "middle",
        nameGap: 32,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        data: buckets.map((b) => `${formatInt(b.lo)}-${formatInt(b.hi)}%`),
        axisLabel: { color: tickColor, fontSize: 10 },
        axisLine: { lineStyle: { color: axisColor } },
      },
      yAxis: {
        type: "value",
        name: "Countries",
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
        minInterval: 1,
      },
      tooltip: {
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
          itemStyle: { color: isDark ? "#38bdf8" : "#0ea5e9" },
          markLine: {
            symbol: "none",
            silent: true,
            data: [{ xAxis: "95-100%" }],
            lineStyle: { type: "dashed", color: isDark ? "#e2e8f0" : "#334155", width: 1 },
            label: { color: tickColor, formatter: "100%" },
          },
        },
      ],
    };
  }, [buckets, isDark]);

  return (
    <div>
      <EChart option={option} style={{ height: "260px", width: "100%" }} />
      {zeroPossibleCount > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {formatInt(zeroPossibleCount)} countries with zero possible tax excluded.
        </p>
      )}
    </div>
  );
}
