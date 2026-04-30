import { useMemo } from "react";
import { formatFloat } from "@/lib/format";
import type { CountryEconomySection, LocationRow } from "@/wasm/wasm_eu5";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { GoodsPressureChart } from "../../features/charts/Markets";
import { useEu5Trigger } from "../useEu5Trigger";

export function CountryEconomyTabContent({
  data,
  locations,
}: {
  data: CountryEconomySection;
  locations: LocationRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <TaxGapScatter locations={locations} />
      <div className="grid grid-cols-2 gap-3">
        <StatRow label="Current Tax" value={formatFloat(data.currentTaxBase, 2)} />
        <StatRow label="Monthly Trade" value={formatFloat(data.monthlyTradeValue, 2)} />
        <StatRow label="Gold" value={formatFloat(data.gold, 1)} />
        <StatRow label="Building Levels" value={formatFloat(data.totalBuildingLevels, 1)} />
        <StatRow label="Possible Tax" value={formatFloat(data.totalPossibleTax, 2)} />
      </div>

      {data.marketMembership.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Market membership
          </p>
          <div className="flex flex-col gap-1">
            {data.marketMembership.map((m) => (
              <div key={m.marketCenterName} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{m.marketCenterName}</span>
                <span className="font-mono text-xs text-slate-400">{m.locationCount} loc</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaxGapScatter({ locations }: { locations: LocationRow[] }) {
  const isDark = isDarkMode();

  const eligible = useMemo(() => locations.filter((r) => r.possibleTax > 0), [locations]);

  const scatterData = useMemo(
    (): [number, number][] => eligible.map((r) => [r.possibleTax, r.tax]),
    [eligible],
  );

  const diagonalMax = useMemo(() => {
    const max = Math.max(...eligible.map((r) => r.possibleTax));
    return max > 0 ? max : 1;
  }, [eligible]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    return {
      grid: { left: 70, right: 20, top: 16, bottom: 50 },
      xAxis: {
        type: "value",
        name: "Possible Tax",
        nameLocation: "middle",
        nameGap: 36,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        min: 0,
      },
      yAxis: {
        type: "value",
        name: "Actual Tax",
        nameLocation: "middle",
        nameGap: 52,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        min: 0,
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = eligible[params.dataIndex ?? -1];
          if (!d) return "";
          const gap = d.possibleTax - d.tax;
          const realization = d.possibleTax > 0 ? (d.tax / d.possibleTax) * 100 : 100;
          return [
            `<strong>${escapeEChartsHtml(d.name)}</strong>`,
            `Possible Tax: ${formatFloat(d.possibleTax, 2)}`,
            `Actual Tax: ${formatFloat(d.tax, 2)}`,
            `Gap: ${formatFloat(gap, 2)}`,
            `Realization: ${formatFloat(realization, 1)}%`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "line",
          data: [
            [0, 0],
            [diagonalMax, diagonalMax],
          ],
          lineStyle: { type: "dashed", color: isDark ? "#475569" : "#94a3b8", width: 1 },
          symbol: "none",
          silent: true,
          tooltip: { show: false },
        },
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 6,
          itemStyle: { color: isDark ? "#93c5fd" : "#3b82f6", opacity: 0.8 },
        },
      ],
    };
  }, [scatterData, diagonalMax, isDark, eligible]);

  if (eligible.length < 2) return null;

  return (
    <section>
      <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
        Tax Gap · Possible vs Actual
      </p>
      <EChart option={option} style={{ height: "300px", width: "100%" }} />
    </section>
  );
}

export function MarketGoodsTabContent({ anchorLocationIdx }: { anchorLocationIdx: number }) {
  const { data: goods, loading } = useEu5Trigger(
    (engine) => engine.trigger.getMarketGoodsProfile(anchorLocationIdx),
    [anchorLocationIdx],
  );

  if (loading && !goods) {
    return <div className="h-64 animate-pulse rounded bg-white/5" />;
  }

  if (!goods || goods.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">No market goods data.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <GoodsPressureChart goods={goods} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
      <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-100">{value}</span>
    </div>
  );
}
