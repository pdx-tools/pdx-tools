import type React from "react";
import { useMemo } from "react";
import { formatFloat, formatInt } from "@/lib/format";
import type { CountryReligionSection, ReligionShare } from "@/wasm/wasm_eu5";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";

export function ReligionTabContent({ data }: { data: CountryReligionSection }) {
  const { religionBreakdown } = data;
  if (religionBreakdown.length === 0) {
    return <p className="text-sm text-slate-500">No religion data.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <SectionTitle>Locations · Population</SectionTitle>
        <ReligionStackedBars breakdown={religionBreakdown} />
        <ReligionLegend breakdown={religionBreakdown} />
      </section>
    </div>
  );
}

function ReligionStackedBars({ breakdown }: { breakdown: ReligionShare[] }) {
  const totalLocations = breakdown.reduce((s, r) => s + r.locationCount, 0);
  const totalPopulation = breakdown.reduce((s, r) => s + r.population, 0);

  const option = useMemo<EChartsOption>(() => {
    const locRow: Record<string, string | number> = { metric: "Locations" };
    const popRow: Record<string, string | number> = { metric: "Population" };
    for (const r of breakdown) {
      locRow[r.religion] = totalLocations > 0 ? (r.locationCount / totalLocations) * 100 : 0;
      popRow[r.religion] = totalPopulation > 0 ? (r.population / totalPopulation) * 100 : 0;
    }

    return {
      dataset: {
        source: [locRow, popRow],
        dimensions: ["metric", ...breakdown.map((r) => r.religion)],
      },
      grid: { left: 70, right: 0, top: 4, bottom: 4 },
      xAxis: {
        type: "value",
        max: 100,
        show: false,
      },
      yAxis: {
        type: "category",
        axisLabel: { color: "#94a3b8", fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      tooltip: {
        trigger: "axis",
        appendToBody: true,
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const metric = String((arr[0] as { axisValue?: string })?.axisValue ?? "");
          const isLocations = metric === "Locations";
          return arr
            .map((p) => {
              const row = breakdown.find(
                (r) => r.religion === (p as { seriesName?: string }).seriesName,
              );
              if (!row) return "";
              const [abs, pct] = isLocations
                ? [row.locationCount, totalLocations > 0 ? row.locationCount / totalLocations : 0]
                : [row.population, totalPopulation > 0 ? row.population / totalPopulation : 0];
              return `${escapeEChartsHtml(row.religion)}: ${formatInt(abs)} (${formatFloat(pct * 100, 1)}%)`;
            })
            .filter(Boolean)
            .join("<br/>");
        },
      },
      series: breakdown.map((r) => ({
        name: r.religion,
        type: "bar",
        stack: "total",
        encode: { x: r.religion, y: "metric" },
        itemStyle: { color: r.colorHex },
      })),
    };
  }, [breakdown, totalLocations, totalPopulation]);

  return <EChart option={option} style={{ height: "86px", width: "100%" }} />;
}

function ReligionLegend({ breakdown }: { breakdown: ReligionShare[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {breakdown.map((row) => (
        <div key={row.religion} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: row.colorHex }} />
          {row.religion}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
      {children}
    </p>
  );
}
