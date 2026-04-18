import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { EntityBreakdownRow } from "@/wasm/wasm_eu5";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { formatFloat, formatInt } from "@/lib/format";

interface Props {
  rows: EntityBreakdownRow[];
}

export function EntityComparisonChart({ rows }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const label = rows[0]?.modeMetricLabel ?? "Value";
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number }[])[0];
          if (!p) return "";
          return `${escapeEChartsHtml(p.name)}: ${formatMetricValue(label, p.value)}`;
        },
      },
      xAxis: {
        type: "category",
        data: rows.map((r) => r.entityRef.name),
        axisLabel: { rotate: 35, color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        name: label,
        nameTextStyle: { color: "#64748b", fontSize: 10 },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          type: "bar",
          data: rows.map((r) => ({
            value: r.modeMetric,
            itemStyle: { color: r.entityRef.colorHex },
          })),
        },
      ],
      grid: { left: 50, right: 20, top: 30, bottom: 70 },
    };
  }, [rows]);

  return <EChart option={option} style={{ height: 200 }} />;
}

function formatMetricValue(label: string, value: number): string {
  return label === "Population" ? formatInt(value) : formatFloat(value, 2);
}
