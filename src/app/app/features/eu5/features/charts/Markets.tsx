import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { MarketScopeSummary, ScopedGoodSummary, ScopedMarketSummary } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../../EntityProfile/components/StatItem";
import { MarketProductionLocations } from "./MarketProductionLocations";
import { GoodsMarketsHeatmap } from "./GoodsMarketsHeatmap";
import { useEu5EntityChartClick } from "./useEntityChartClick";

const GOODS_BAR_CAP = 20;

function MarketsScopeHeader({ data }: { data?: MarketScopeSummary }) {
  if (!data) return <InsightScopeHeaderSkeleton />;

  return (
    <InsightScopeHeader>
      <StatItem label="Markets" value={formatInt(data.marketCount)} />
      <StatItem label="Goods" value={formatInt(data.goodCount)} />
      <StatItem label="Market Value" value={formatInt(data.marketValue)} />
      <StatItem label="Shortage $" value={formatInt(data.shortageValue)} />
      <StatItem label="Surplus $" value={formatInt(data.surplusValue)} />
      <StatItem label="Avg Access" value={`${formatFloat(data.avgMarketAccess * 100, 0)}%`} />
    </InsightScopeHeader>
  );
}

export function MarketsInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getMarketInsight());

  const goods = insightQuery.data?.goods ?? [];
  const markets = insightQuery.data?.markets ?? [];
  const cells = insightQuery.data?.goodMarketCells ?? [];
  const topProduction = insightQuery.data?.topProductionLocations ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <MarketsScopeHeader data={insightQuery.data?.scope} />
      {insightQuery.loading && !insightQuery.data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          {goods.length > 0 && (
            <section>
              <SectionTitle>
                What is the selected scope missing, and what is it overproducing?
              </SectionTitle>
              <GoodsPressureChart goods={goods} />
            </section>
          )}

          {markets.length >= 2 && (
            <section>
              <SectionTitle>Which markets matter most, and which are stressed?</SectionTitle>
              <MarketsStressChart markets={markets} />
            </section>
          )}

          {goods.length >= 2 && markets.length >= 2 && cells.length > 0 && (
            <section>
              <SectionTitle>
                Is the shortage systemic or localized to specific markets?
              </SectionTitle>
              <GoodsMarketsHeatmap goods={goods} markets={markets} cells={cells} />
            </section>
          )}

          {topProduction.length > 0 && (
            <section>
              <SectionTitle>Where should I look first?</SectionTitle>
              <MarketProductionLocations locations={topProduction} />
            </section>
          )}

          {goods.length === 0 && markets.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              No market data in the selected scope
            </p>
          )}
        </>
      )}
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

type GoodBarDatum = ScopedGoodSummary & {
  shortageBar: number;
  surplusBar: number;
};

function goodTooltip(d: ScopedGoodSummary): string {
  return [
    `<strong>${escapeEChartsHtml(d.name)}</strong>`,
    `Supply: ${formatFloat(d.supply, 2)}`,
    `Demand: ${formatFloat(d.demand, 2)}`,
    `Total Taken: ${formatFloat(d.totalTaken, 2)}`,
    `Price (weighted): ${formatFloat(d.weightedPrice, 2)}`,
    `Shortage: ${formatFloat(d.shortage, 2)} ($${formatFloat(d.shortageValue, 0)})`,
    `Surplus: ${formatFloat(d.surplus, 2)} ($${formatFloat(d.surplusValue, 0)})`,
    `Balance Ratio: ${formatFloat(d.balanceRatio, 2)}`,
    `Stockpile: ${formatFloat(d.stockpile, 0)}`,
    `Markets: ${formatInt(d.marketCount)}`,
    `Producing locations: ${formatInt(d.producingLocationCount)}`,
  ].join("<br/>");
}

function GoodsPressureChart({ goods }: { goods: ScopedGoodSummary[] }) {
  const isDark = isDarkMode();

  const sorted = useMemo((): GoodBarDatum[] => {
    const top = [...goods]
      .sort((a, b) => {
        const ai = Math.max(a.shortageValue, a.surplusValue);
        const bi = Math.max(b.shortageValue, b.surplusValue);
        return bi - ai;
      })
      .slice(0, GOODS_BAR_CAP);
    return top.map((g) => ({
      ...g,
      shortageBar: g.shortageValue,
      surplusBar: -g.surplusValue,
    }));
  }, [goods]);

  const hasImbalance = sorted.some((d) => d.shortageValue > 0 || d.surplusValue > 0);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      dataset: {
        source: sorted,
        dimensions: [
          "name",
          "supply",
          "demand",
          "totalTaken",
          "weightedPrice",
          "shortageValue",
          "surplusValue",
          "balanceRatio",
          "shortageBar",
          "surplusBar",
        ],
      },
      grid: {
        left: 100,
        right: 20,
        top: 10,
        bottom: 30,
      },
      xAxis: {
        type: "value",
        axisLabel: { color: tickColor, fontSize: 10 },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { color: tickColor, fontSize: 11, fontWeight: 600, width: 90 },
        axisLine: { lineStyle: { color: axisColor } },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0];
          if (!first) return "";
          const dataIndex = (first as { dataIndex?: number }).dataIndex;
          if (dataIndex == null) return "";
          const d = sorted[dataIndex];
          if (!d) return "";
          return goodTooltip(d);
        },
      },
      series: [
        {
          name: "Surplus $",
          type: "bar",
          stack: "balance",
          encode: { x: "surplusBar", y: "name" },
          itemStyle: { color: isDark ? "#38bdf8" : "#0ea5e9" },
          emphasis: { focus: "series" },
        },
        {
          name: "Shortage $",
          type: "bar",
          stack: "balance",
          encode: { x: "shortageBar", y: "name" },
          itemStyle: { color: isDark ? "#f97316" : "#ea580c" },
          emphasis: { focus: "series" },
        },
      ],
    };
  }, [sorted, isDark]);

  if (!hasImbalance) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        No good imbalances in the selected scope
      </p>
    );
  }

  const height = sorted.length * 20 + 60;
  return <EChart option={option} style={{ height: `${height}px`, width: "100%" }} />;
}

function marketTooltip(d: ScopedMarketSummary): string {
  return [
    `<strong>${escapeEChartsHtml(d.centerName)}</strong>`,
    `Market Value: ${formatFloat(d.marketValue, 0)}`,
    `Shortage $: ${formatFloat(d.shortagePressure, 0)}`,
    `Surplus $: ${formatFloat(d.surplusPressure, 0)}`,
    `Total Taken: ${formatFloat(d.totalTaken, 0)}`,
    `Goods: ${formatInt(d.goodCount)}`,
    `Scoped Locations: ${formatInt(d.scopedLocationCount)}`,
    `Member Countries: ${formatInt(d.memberCountryCount)}`,
    `Avg Access: ${formatFloat(d.avgMarketAccess * 100, 0)}%`,
  ].join("<br/>");
}

function MarketsStressChart({ markets }: { markets: ScopedMarketSummary[] }) {
  const isDark = isDarkMode();

  const topMarkets = useMemo(
    () =>
      new Set(
        [...markets]
          .sort((a, b) => b.marketValue - a.marketValue)
          .slice(0, 8)
          .map((m) => m.anchorLocationIdx),
      ),
    [markets],
  );

  const maxTaken = useMemo(() => Math.max(1, ...markets.map((m) => m.totalTaken)), [markets]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      grid: { left: 80, right: 60, top: 20, bottom: 60 },
      xAxis: {
        type: "value",
        name: "Market Value",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
        min: 0,
      },
      yAxis: {
        type: "value",
        name: "Shortage Pressure ($)",
        nameLocation: "middle",
        nameGap: 60,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
        min: 0,
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, yAxisIndex: 0 },
        { type: "slider", xAxisIndex: 0, bottom: 0, height: 20, textStyle: { color: tickColor } },
      ],
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const dataIndex = params.dataIndex;
          if (dataIndex == null) return "";
          const d = markets[dataIndex];
          if (!d) return "";
          return marketTooltip(d);
        },
      },
      series: [
        {
          type: "scatter",
          data: markets.map((m) => [m.marketValue, m.shortagePressure]),
          symbolSize: (_val, params) => {
            const d = markets[params.dataIndex];
            if (!d) return 6;
            const scaled = Math.sqrt((d.totalTaken / maxTaken) * 400) + 6;
            return Math.max(6, Math.min(36, scaled));
          },
          itemStyle: {
            color: (params) => {
              const d = markets[params.dataIndex];
              return d?.colorHex ?? (isDark ? "#93c5fd" : "#3b82f6");
            },
            opacity: 0.75,
          },
          label: {
            show: true,
            formatter: (params) => {
              const d = markets[params.dataIndex];
              if (!d) return "";
              return topMarkets.has(d.anchorLocationIdx) || markets.length <= 10
                ? d.centerName.replace(/ Market$/, "")
                : "";
            },
            position: "top",
            color: isDark ? "#e2e8f0" : "#1e293b",
            fontSize: 10,
            fontWeight: 600,
            distance: 4,
          },
        },
      ],
    };
  }, [markets, topMarkets, isDark, maxTaken]);

  const handleInit = useEu5EntityChartClick({
    kind: "market",
    getAnchorLocationIdx: (params) => {
      const dataIndex = params.dataIndex;
      return dataIndex == null ? null : markets[dataIndex]?.anchorLocationIdx;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}
