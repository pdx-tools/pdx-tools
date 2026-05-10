import { useMemo, useState } from "react";
import { ToggleGroup } from "@/components/ToggleGroup";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { MarketScopeSummary, ScopedGoodSummary, ScopedMarketSummary } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { goodsIconHtml } from "../../components/icons/eu5IconHtml";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../profiles/components/StatItem";
import { MarketProductionLocations } from "./MarketProductionLocations";
import { GoodsMarketsHeatmap } from "./GoodsMarketsHeatmap";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { useEu5SaveDate } from "../../store/eu5Store";

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
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
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
            <Eu5InsightEmptyState title="No market data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
      {children}
    </p>
  );
}

type GoodBarDatum = ScopedGoodSummary & {
  shortageBar: number;
  surplusBar: number;
};

export type GoodsPressureMetric = "units" | "value";

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

export function GoodsPressureChart({
  goods,
  selectedGoodKey,
  onGoodSelect,
  metric: controlledMetric,
  onMetricChange,
}: {
  goods: ScopedGoodSummary[];
  selectedGoodKey?: string;
  onGoodSelect?: (good: ScopedGoodSummary) => void;
  metric?: GoodsPressureMetric;
  onMetricChange?: (metric: GoodsPressureMetric) => void;
}) {
  const isDark = isDarkMode();
  const [internalMetric, setInternalMetric] = useState<GoodsPressureMetric>("value");
  const metric = controlledMetric ?? internalMetric;
  const setMetric = (m: GoodsPressureMetric) => {
    setInternalMetric(m);
    onMetricChange?.(m);
  };
  const isValueMetric = metric === "value";

  const sorted = useMemo((): GoodBarDatum[] => {
    const top = [...goods]
      .sort((a, b) => {
        const ai = Math.max(
          isValueMetric ? a.shortageValue : a.shortage,
          isValueMetric ? a.surplusValue : a.surplus,
        );
        const bi = Math.max(
          isValueMetric ? b.shortageValue : b.shortage,
          isValueMetric ? b.surplusValue : b.surplus,
        );
        return bi - ai;
      })
      .slice(0, GOODS_BAR_CAP);
    return top.map((g) => ({
      ...g,
      shortageBar: isValueMetric ? g.shortageValue : g.shortage,
      surplusBar: -(isValueMetric ? g.surplusValue : g.surplus),
    }));
  }, [goods, isValueMetric]);

  const hasImbalance = sorted.some((d) =>
    isValueMetric ? d.shortageValue > 0 || d.surplusValue > 0 : d.shortage > 0 || d.surplus > 0,
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    const metricLabel = isValueMetric ? "value" : "units";

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
        name: `Surplus ${metricLabel} ← 0 → Shortage ${metricLabel}`,
        nameLocation: "middle",
        nameGap: 24,
        nameTextStyle: { color: tickColor, fontSize: 11, fontWeight: 600 },
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
          name: `Surplus ${metricLabel}`,
          type: "bar",
          stack: "balance",
          encode: { x: "surplusBar", y: "name" },
          itemStyle: {
            color: (params) => {
              const d = sorted[params.dataIndex];
              if (d?.key === selectedGoodKey) return isDark ? "#67e8f9" : "#0284c7";
              return isDark ? "#38bdf8" : "#0ea5e9";
            },
          },
          emphasis: { focus: "series" },
        },
        {
          name: `Shortage ${metricLabel}`,
          type: "bar",
          stack: "balance",
          encode: { x: "shortageBar", y: "name" },
          itemStyle: {
            color: (params) => {
              const d = sorted[params.dataIndex];
              if (d?.key === selectedGoodKey) return isDark ? "#fdba74" : "#c2410c";
              return isDark ? "#f97316" : "#ea580c";
            },
          },
          emphasis: { focus: "series" },
        },
      ],
    };
  }, [sorted, isDark, isValueMetric, selectedGoodKey]);

  if (!hasImbalance) {
    return (
      <p className="py-6 text-center text-sm text-game-ink-500">
        No good imbalances in the selected scope
      </p>
    );
  }

  const height = sorted.length * 20 + 60;
  return (
    <div className="flex flex-col gap-2">
      {controlledMetric == null && (
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            value={metric}
            onValueChange={(value) => {
              if (value) setMetric(value as GoodsPressureMetric);
            }}
            className="inline-flex w-fit rounded-md border border-game-line bg-game-panel-hover p-1"
            aria-label="Goods pressure metric comparison"
          >
            <ToggleGroup.Item value="value">Value</ToggleGroup.Item>
            <ToggleGroup.Item value="units">Units</ToggleGroup.Item>
          </ToggleGroup>
        </div>
      )}
      <EChart
        option={option}
        style={{ height: `${height}px`, width: "100%" }}
        onInit={
          onGoodSelect
            ? (chart) => {
                chart.on("click", (params) => {
                  const dataIndex = params.dataIndex;
                  if (dataIndex == null) return;
                  const good = sorted[dataIndex];
                  if (good) onGoodSelect(good);
                });
              }
            : undefined
        }
      />
    </div>
  );
}

type GoodBreakdownEntry = ScopedGoodSummary["suppliedBreakdown"][number];

export function MarketGoodDetail({ good }: { good: ScopedGoodSummary }) {
  const shortage = Math.max(0, good.demand - good.totalTaken);
  const demandCoverage = good.demand > 0 ? good.stockpile / good.demand : 0;
  const shortfallCoverage = shortage > 0 ? good.stockpile / shortage : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GoodStat label="Price" value={formatFloat(good.weightedPrice, 2)} />
        <GoodStat label="Supply" value={formatFloat(good.supply, 2)} />
        <GoodStat label="Demand" value={formatFloat(good.demand, 2)} />
        <GoodStat label="Taken" value={formatFloat(good.totalTaken, 2)} />
        <GoodStat label="Stockpile" value={formatFloat(good.stockpile, 0)} />
        <GoodStat label="Demand Cover" value={`${formatFloat(demandCoverage, 1)} mo`} />
        <GoodStat
          label="Shortfall Cover"
          value={
            shortfallCoverage == null ? "No shortfall" : `${formatFloat(shortfallCoverage, 1)} mo`
          }
        />
        <GoodStat label="Impact" value={formatFloat(good.impact, 2)} />
      </div>

      <section>
        <SectionTitle>Where does {good.name} come from, and who gets it?</SectionTitle>
        <MarketGoodSankey good={good} />
      </section>

      <section>
        <SectionTitle>Are demand categories receiving what they asked for?</SectionTitle>
        <MarketGoodFulfillmentChart good={good} />
      </section>

      <section>
        <SectionTitle>How has the price moved?</SectionTitle>
        <MarketGoodPriceHistoryChart good={good} />
      </section>
    </div>
  );
}

function GoodStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-game-line bg-game-panel-hover px-3 py-2">
      <span className="text-[10px] font-semibold tracking-wider text-game-ink-300 uppercase">
        {label}
      </span>
      <span className="text-sm font-semibold text-game-ink-100">{value}</span>
    </div>
  );
}

function MarketGoodSankey({ good }: { good: ScopedGoodSummary }) {
  const option = useMemo((): EChartsOption => buildMarketGoodSankeyOption(good), [good]);
  const hasFlow =
    good.suppliedBreakdown.length > 0 ||
    good.takenBreakdown.length > 0 ||
    good.demandedBreakdown.length > 0;

  if (!hasFlow) {
    return (
      <p className="rounded-lg border border-game-line bg-game-panel-hover px-3 py-6 text-center text-sm text-game-ink-500">
        No category breakdown is available for this good.
      </p>
    );
  }

  return <EChart option={option} style={{ height: "360px", width: "100%" }} />;
}

function buildMarketGoodSankeyOption(good: ScopedGoodSummary): EChartsOption {
  const sourcePrefix = "source:";
  const sinkPrefix = "sink:";
  const goodNode = `good:${good.name}`;
  const nodes = new Map<string, { name: string; itemStyle?: { color: string } }>();
  const links: { source: string; target: string; value: number }[] = [];
  const addNode = (name: string, color?: string) => {
    nodes.set(name, color ? { name, itemStyle: { color } } : { name });
  };

  addNode(goodNode, "#64748b");

  for (const entry of positiveEntries(good.suppliedBreakdown)) {
    const node = `${sourcePrefix}${entry.category}`;
    addNode(node, "#0ea5e9");
    links.push({ source: node, target: goodNode, value: entry.amount });
  }

  for (const entry of positiveEntries(good.takenBreakdown)) {
    const node = `${sinkPrefix}${entry.category}`;
    addNode(node, "#22c55e");
    links.push({ source: goodNode, target: node, value: entry.amount });
  }

  const takenByCategory = new Map(
    good.takenBreakdown.map((entry) => [entry.category, entry.amount]),
  );
  for (const entry of positiveEntries(good.demandedBreakdown)) {
    const unmet = Math.max(0, entry.amount - (takenByCategory.get(entry.category) ?? 0));
    if (unmet <= 0.000001) continue;
    const node = `${sinkPrefix}${entry.category} unmet`;
    addNode(node, "#f97316");
    links.push({ source: goodNode, target: node, value: unmet });
  }

  const surplus = Math.max(0, good.supply - good.totalTaken);
  if (surplus > 0.000001) {
    const node = `${sinkPrefix}Surplus`;
    addNode(node, "#38bdf8");
    links.push({ source: goodNode, target: node, value: surplus });
  }

  return {
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
      formatter: (params: unknown) => {
        const p = params as {
          name?: string;
          value?: number;
          data?: { source?: string; target?: string; value?: number };
        };
        if (p.data?.source != null) {
          return `${formatSankeyLabel(p.data.source)} -> ${formatSankeyLabel(p.data.target)}: ${formatFloat(p.data.value ?? 0, 2)}`;
        }
        return `${formatSankeyLabel(p.name)}: ${formatFloat(p.value ?? 0, 2)}`;
      },
    },
    series: [
      {
        type: "sankey",
        emphasis: { focus: "adjacency" },
        nodeAlign: "left",
        nodeGap: 10,
        label: {
          formatter: (params: unknown) => formatSankeyLabel((params as { name: string }).name),
          color: "#e2e8f0",
          fontSize: 11,
          backgroundColor: "rgba(15,23,42,0.72)",
          padding: [2, 5],
          borderRadius: 3,
        },
        data: [...nodes.values()],
        links,
      },
    ],
  };
}

function MarketGoodFulfillmentChart({ good }: { good: ScopedGoodSummary }) {
  const isDark = isDarkMode();
  const rows = useMemo(() => {
    const demanded = new Map(good.demandedBreakdown.map((entry) => [entry.category, entry.amount]));
    const taken = new Map(good.takenBreakdown.map((entry) => [entry.category, entry.amount]));
    const categories = [...new Set([...demanded.keys(), ...taken.keys()])];
    return categories
      .map((category) => ({
        category,
        demanded: demanded.get(category) ?? 0,
        taken: taken.get(category) ?? 0,
      }))
      .sort((a, b) => Math.max(b.demanded, b.taken) - Math.max(a.demanded, a.taken));
  }, [good]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    return {
      dataset: {
        source: rows,
        dimensions: ["category", "demanded", "taken"],
      },
      grid: { left: 110, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: "value",
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        min: 0,
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { color: tickColor, fontSize: 11, fontWeight: 600, width: 100 },
        axisLine: { lineStyle: { color: axisColor } },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const dataIndex = arr[0]?.dataIndex;
          if (dataIndex == null) return "";
          const row = rows[dataIndex];
          if (!row) return "";
          const unmet = Math.max(0, row.demanded - row.taken);
          return [
            `<strong>${escapeEChartsHtml(row.category)}</strong>`,
            `Demanded: ${formatFloat(row.demanded, 2)}`,
            `Taken: ${formatFloat(row.taken, 2)}`,
            `Unmet: ${formatFloat(unmet, 2)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          name: "Demanded",
          type: "bar",
          encode: { x: "demanded", y: "category" },
          itemStyle: { color: isDark ? "#f97316" : "#ea580c", opacity: 0.65 },
        },
        {
          name: "Taken",
          type: "bar",
          encode: { x: "taken", y: "category" },
          itemStyle: { color: isDark ? "#22c55e" : "#16a34a", opacity: 0.8 },
        },
      ],
    };
  }, [rows, isDark]);

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-game-line bg-game-panel-hover px-3 py-6 text-center text-sm text-game-ink-500">
        No demand fulfillment breakdown is available for this good.
      </p>
    );
  }

  return <EChart option={option} style={{ height: `${rows.length * 34 + 70}px`, width: "100%" }} />;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function monthOffsetToDate(baseYear: number, baseMonth: number, offset: number): string {
  const totalMonths = baseYear * 12 + (baseMonth - 1) + offset;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  return `${year} ${MONTH_NAMES[month]}`;
}

function MarketGoodPriceHistoryChart({ good }: { good: ScopedGoodSummary }) {
  const isDark = isDarkMode();
  const saveDate = useEu5SaveDate();
  const data = useMemo(
    () => good.history.map((price, index) => [index - good.history.length + 1, price]),
    [good],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    const baseYear = saveDate?.year ?? 0;
    const baseMonth = saveDate?.month ?? 1;
    const prices = good.history;
    const priceMax = Math.max(...prices);
    const priceMin = Math.min(...prices);
    const base = good.defaultMarketPrice;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const yMin = base != null ? Math.min(r(base * 0.5), priceMin * 0.95) : 0;
    const yMax = base != null ? Math.max(priceMax, r(1.3 * base)) : priceMax * 1.05;

    // Secondary axis: % deviation from base price, aligned to primary axis.
    // pct = (price - base) / base * 100  →  price = base * (1 + pct/100)
    const pctMin = base != null ? ((yMin - base) / base) * 100 : undefined;
    const pctMax = base != null ? ((yMax - base) / base) * 100 : undefined;

    const hasPct = base != null;
    const pctRange = hasPct && pctMin != null && pctMax != null ? pctMax - pctMin : 60;
    const rightGap = hasPct ? 60 : 20;

    return {
      grid: { left: 60, right: rightGap, top: 20, bottom: 50 },
      xAxis: {
        type: "value",
        name: "Date",
        nameLocation: "middle",
        nameGap: 34,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          formatter: (value: number) => monthOffsetToDate(baseYear, baseMonth, value),
          rotate: 30,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
      },
      yAxis: [
        {
          type: "value",
          name: "Price",
          nameLocation: "middle",
          nameGap: 42,
          nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
          axisLabel: {
            color: tickColor,
            formatter: (value: number) => formatFloat(value, 2),
          },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
          min: yMin,
          max: yMax,
        },
        ...(hasPct
          ? [
              {
                type: "value" as const,
                name: "% vs base",
                nameLocation: "middle" as const,
                nameGap: 48,
                nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
                axisLabel: {
                  color: tickColor,
                  formatter: (v: number) =>
                    Math.abs(v) <= pctRange * 0.6 ? `${formatFloat(v, 0)}%` : "",
                },
                axisLine: { lineStyle: { color: axisColor } },
                splitLine: { show: false },
                min: pctMin,
                max: pctMax,
              },
            ]
          : []),
      ],
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const value = arr[0]?.value;
          if (!Array.isArray(value)) return "";
          const offset = Number(value[0]);
          const price = Number(value[1]);
          const dateLabel = monthOffsetToDate(baseYear, baseMonth, offset);
          const pctLine =
            base != null ? `<br/>vs base: ${formatFloat(((price - base) / base) * 100, 1)}%` : "";
          return `<strong>${dateLabel}</strong><br/>Price: ${formatFloat(price, 3)}${pctLine}`;
        },
      },
      dataZoom:
        data.length > 40
          ? [
              { type: "inside", xAxisIndex: 0 },
              {
                type: "slider",
                xAxisIndex: 0,
                bottom: 0,
                height: 18,
                textStyle: { color: tickColor },
              },
            ]
          : undefined,
      series: [
        {
          type: "line",
          data,
          yAxisIndex: 0,
          symbol: "none",
          smooth: true,
          lineStyle: { color: isDark ? "#facc15" : "#ca8a04", width: 2 },
          areaStyle: { color: isDark ? "rgba(250,204,21,0.12)" : "rgba(202,138,4,0.16)" },
          ...(base != null
            ? {
                markLine: {
                  silent: true,
                  symbol: "none",
                  data: [{ yAxis: base }],
                  label: {
                    formatter: `Base: ${formatFloat(base, 2)}`,
                    color: isDark ? "#94a3b8" : "#64748b",
                    fontSize: 10,
                  },
                  lineStyle: {
                    type: "dashed" as const,
                    color: isDark ? "#94a3b8" : "#64748b",
                    width: 1,
                  },
                },
              }
            : {}),
        },
      ],
    };
  }, [data, isDark, saveDate, good.defaultMarketPrice, good.history]);

  if (data.length < 2) {
    return (
      <p className="rounded-lg border border-game-line bg-game-panel-hover px-3 py-6 text-center text-sm text-game-ink-500">
        No price history is available for this good.
      </p>
    );
  }

  return <EChart option={option} style={{ height: "300px", width: "100%" }} />;
}

function positiveEntries(entries: GoodBreakdownEntry[]): GoodBreakdownEntry[] {
  return entries.filter((entry) => entry.amount > 0);
}

function formatSankeyLabel(value?: string): string {
  return (value ?? "").replace(/^(source|sink|good):/, "");
}

export function GoodsPriceVsBaseChart({
  goods,
  selectedGoodKey,
  onGoodSelect,
}: {
  goods: ScopedGoodSummary[];
  selectedGoodKey?: string;
  onGoodSelect?: (good: ScopedGoodSummary) => void;
}) {
  const isDark = isDarkMode();

  const filtered = useMemo(
    () =>
      goods.filter(
        (g): g is ScopedGoodSummary & { defaultMarketPrice: number } =>
          (g.supply > 0 || g.demand > 0) && g.defaultMarketPrice != null && g.weightedPrice > 0,
      ),
    [goods],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    const selectedBorder = isDark ? "#f1f5f9" : "#0f172a";
    const data = filtered.map((g) => {
      const isSelected = g.key === selectedGoodKey;
      return {
        value: [
          ((g.weightedPrice - g.defaultMarketPrice) / g.defaultMarketPrice) * 100,
          g.weightedPrice,
        ] as [number, number],
        key: g.key,
        name: g.name,
        color: g.colorHex,
        base: g.defaultMarketPrice,
        itemStyle: {
          color: g.colorHex || (isDark ? "#93c5fd" : "#3b82f6"),
          opacity: 0.85,
          borderColor: isSelected ? selectedBorder : "transparent",
          borderWidth: isSelected ? 2 : 0,
        },
        symbolSize: isSelected ? 14 : 8,
      };
    });

    return {
      grid: { left: 70, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: "value",
        name: "% vs Base Price",
        nameLocation: "middle",
        nameGap: 34,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          formatter: (v: number) => `${v > 0 ? "+" : ""}${formatFloat(v, 0)}%`,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      yAxis: {
        type: "value",
        name: "Current Price",
        nameLocation: "middle",
        nameGap: 50,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
        min: 0,
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as (typeof data)[number];
          const pct =
            ((d.value[0] as number) >= 0 ? "+" : "") + formatFloat(d.value[0] as number, 1);
          return [
            `<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle">${goodsIconHtml(d.key)}<strong>${escapeEChartsHtml(d.name)}</strong></span>`,
            `Current Price: ${formatFloat(d.value[1] as number, 3)}`,
            `Base Price: ${formatFloat(d.base, 3)}`,
            `vs Base: ${pct}%`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "scatter",
          data,
          markLine: {
            silent: true,
            symbol: "none",
            data: [{ xAxis: 0 }],
            lineStyle: { type: "dashed", color: isDark ? "#94a3b8" : "#64748b", width: 1 },
            label: { show: false },
          },
        },
      ],
    };
  }, [filtered, isDark, selectedGoodKey]);

  if (filtered.length === 0) {
    return (
      <p className="rounded-lg border border-game-line bg-game-panel-hover px-3 py-6 text-center text-sm text-game-ink-500">
        No goods with base price data in the selected scope.
      </p>
    );
  }

  return (
    <EChart
      option={option}
      style={{ height: "320px", width: "100%" }}
      onInit={
        onGoodSelect
          ? (chart) => {
              chart.on("click", (params) => {
                const good = filtered[params.dataIndex ?? -1];
                if (good) onGoodSelect(good);
              });
            }
          : undefined
      }
    />
  );
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
          .map((m) => m.marketId),
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
              return topMarkets.has(d.marketId) || markets.length <= 10
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
    backLabel: "Markets",
    getTarget: (params) => {
      const dataIndex = params.dataIndex;
      const market = dataIndex == null ? null : markets[dataIndex];
      return market
        ? {
            id: market.marketId,
            anchorLocationIdx: market.anchorLocationIdx,
            label: market.centerName,
          }
        : null;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}
