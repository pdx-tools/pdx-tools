import { useMemo, useState, useEffectEvent } from "react";
import { ToggleGroup } from "@/components/ToggleGroup";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { MarketScopeSummary, ScopedGoodSummary, ScopedMarketSummary } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartDataZoomSlider,
  chartInk,
  chartTooltip,
  divergingPoles,
  getEChartsTheme,
  selectionColor,
  seriesColor,
  seriesFill,
} from "@/components/viz/echartsTheme";
import { goodsIconHtml } from "../../components/icons/eu5IconHtml";
import {
  GOODS_CELL_SIZE_32,
  goodsAtlasData,
  goodsAtlasUrl32,
  goodsDimensions32,
} from "../../components/icons/goods";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { MarketProductionLocations } from "./MarketProductionLocations";
import { GoodsMarketsHeatmap } from "./GoodsMarketsHeatmap";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { useEu5SaveDate } from "../../store/eu5Store";
import { EmptyNote, SectionTitle, StatItem } from "../../components";

const GOODS_BAR_CAP = 20;
const ARROW_WINDOW_MONTHS = 12;
const ARROW_DECAY = 0.95;
const ARROW_TOP_N = 5;
const ARROW_MAX_PCT = 10;
const ARROW_SCALE_FACTOR = 10;
const ARROW_MIN_SLOPE_PCT = 0.000001;

export type GoodsPriceTrajectoryInput = Pick<
  ScopedGoodSummary,
  "good" | "history" | "defaultMarketPrice" | "weightedPrice"
>;

export type GoodsPriceArrowDatum = {
  startX: number;
  endX: number;
  y: number;
  key: string;
  slopePct: number;
};

export function weightedSlope(
  history: number[],
  windowMonths = ARROW_WINDOW_MONTHS,
  decay = ARROW_DECAY,
): number {
  const values = history.slice(-windowMonths).filter((value) => Number.isFinite(value));
  if (values.length < 2) return 0;

  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWXX = 0;
  let sumWXY = 0;

  for (let i = 0; i < values.length; i++) {
    const x = i;
    const y = values[i];
    const age = values.length - 1 - i;
    const w = decay ** age;
    sumW += w;
    sumWX += w * x;
    sumWY += w * y;
    sumWXX += w * x * x;
    sumWXY += w * x * y;
  }

  const denominator = sumWXX - (sumWX * sumWX) / sumW;
  if (Math.abs(denominator) < Number.EPSILON) return 0;
  return (sumWXY - (sumWX * sumWY) / sumW) / denominator;
}

export function selectGoodsPriceTrajectoryKeys(
  goods: GoodsPriceTrajectoryInput[],
  topN = ARROW_TOP_N,
): Set<string> {
  const candidates = goods
    .map((g) => {
      const base = g.defaultMarketPrice;
      if (base == null || base <= 0 || g.history.length < 2) return null;
      const slopePct = (weightedSlope(g.history) / base) * 100;
      if (!Number.isFinite(slopePct) || Math.abs(slopePct) <= ARROW_MIN_SLOPE_PCT) return null;
      return { key: g.good.key, slopePct };
    })
    .filter((entry): entry is { key: string; slopePct: number } => entry != null);

  const rising = candidates
    .filter((entry) => entry.slopePct > 0)
    .sort((a, b) => b.slopePct - a.slopePct)
    .slice(0, topN);
  const falling = candidates
    .filter((entry) => entry.slopePct < 0)
    .sort((a, b) => a.slopePct - b.slopePct)
    .slice(0, topN);

  return new Set([...rising, ...falling].map((entry) => entry.key));
}

function goodsPriceTrajectoryPct(good: GoodsPriceTrajectoryInput): number | undefined {
  const base = good.defaultMarketPrice;
  if (base == null || base <= 0 || good.history.length < 2) return undefined;
  const slopePct = (weightedSlope(good.history) / base) * 100;
  if (!Number.isFinite(slopePct) || Math.abs(slopePct) <= ARROW_MIN_SLOPE_PCT) return undefined;
  return slopePct;
}

export function buildGoodsPriceArrowData(
  goods: GoodsPriceTrajectoryInput[],
): GoodsPriceArrowDatum[] {
  const selectedKeys = selectGoodsPriceTrajectoryKeys(goods);

  return goods.flatMap((g) => {
    const base = g.defaultMarketPrice;
    if (base == null || base <= 0 || !selectedKeys.has(g.good.key)) return [];
    const slopePct = goodsPriceTrajectoryPct(g);
    if (slopePct == null) return [];
    const startX = ((g.weightedPrice - base) / base) * 100;
    const arrowLengthPct = Math.min(Math.abs(slopePct) * ARROW_SCALE_FACTOR, ARROW_MAX_PCT);
    return [
      {
        startX,
        endX: startX + (slopePct > 0 ? arrowLengthPct : -arrowLengthPct),
        y: g.weightedPrice,
        key: g.good.key,
        slopePct,
      },
    ];
  });
}

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

type GoodBarDatum = ScopedGoodSummary & {
  shortageBar: number;
  surplusBar: number;
};

export type GoodsPressureMetric = "units" | "value";

function goodTooltip(d: ScopedGoodSummary): string {
  return [
    `<strong>${escapeEChartsHtml(d.good.name)}</strong>`,
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
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    const metricLabel = isValueMetric ? "value" : "units";

    // Label each populated side at zero, where surplus and shortage diverge.
    const hasSurplus = sorted.some((d) => d.surplusBar < 0);
    const hasShortage = sorted.some((d) => d.shortageBar > 0);

    const pivotLabel = (text: string, swatch: string, side: "left" | "right") => ({
      xAxis: 0,
      lineStyle: { color: axisColor, width: 1, type: "solid" as const },
      label: {
        show: true,
        position: "start" as const,
        distance: 8,
        align: side === "left" ? ("right" as const) : ("left" as const),
        verticalAlign: "bottom" as const,
        offset: [side === "left" ? -5 : 5, 0] as [number, number],
        color: tickColor,
        fontSize: 10,
        formatter: text,
        rich: { sw: { backgroundColor: swatch, width: 7, height: 7, borderRadius: 2 } },
      },
    });

    return {
      dataset: {
        source: sorted.map((g) => ({
          goodName: g.good.name,
          shortageBar: g.shortageBar,
          surplusBar: g.surplusBar,
        })),
        dimensions: ["goodName", "shortageBar", "surplusBar"],
      },
      grid: {
        left: 100,
        right: 20,
        top: 30,
        bottom: 24,
      },
      xAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          // Surplus is negated only to place it left of zero.
          formatter: (value: number) => formatInt(Math.abs(value)),
        },
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
        ...chartTooltip,
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
          encode: { x: "surplusBar", y: "goodName" },
          // ECharts needs a series color to render the mark-line swatch.
          color: divergingPoles.cool,
          itemStyle: {
            color: (params) => {
              const d = sorted[params.dataIndex];
              if (d?.good.key === selectedGoodKey) return selectionColor;
              return divergingPoles.cool;
            },
          },
          emphasis: { focus: "series" },
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            emphasis: { disabled: true },
            data: [
              ...(hasSurplus
                ? [pivotLabel(`{sw|}  ← Surplus ${metricLabel}`, divergingPoles.cool, "left")]
                : []),
              ...(hasShortage
                ? [pivotLabel(`{sw|}  Shortage ${metricLabel} →`, divergingPoles.warm, "right")]
                : []),
            ],
          },
        },
        {
          name: `Shortage ${metricLabel}`,
          type: "bar",
          stack: "balance",
          encode: { x: "shortageBar", y: "goodName" },
          color: divergingPoles.warm,
          itemStyle: {
            color: (params) => {
              const d = sorted[params.dataIndex];
              if (d?.good.key === selectedGoodKey) return selectionColor;
              return divergingPoles.warm;
            },
          },
          emphasis: { focus: "series" },
        },
      ],
    };
  }, [sorted, isValueMetric, selectedGoodKey]);

  if (!hasImbalance) {
    return (
      <p className="py-6 text-center text-sm text-game-ink-500">
        No good imbalances in the selected scope
      </p>
    );
  }

  const handlePressureClick = useEffectEvent((params: { dataIndex?: number }) => {
    if (!onGoodSelect) return;
    const dataIndex = params.dataIndex;
    if (dataIndex == null) return;
    const good = sorted[dataIndex];
    if (good) onGoodSelect(good);
  });

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
            className="inline-flex w-fit rounded-control border border-game-line bg-game-panel-hover p-1"
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
                chart.on("click", handlePressureClick);
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
        <StatItem boxed label="Price" value={formatFloat(good.weightedPrice, 2)} />
        <StatItem boxed label="Supply" value={formatFloat(good.supply, 2)} />
        <StatItem boxed label="Demand" value={formatFloat(good.demand, 2)} />
        <StatItem boxed label="Taken" value={formatFloat(good.totalTaken, 2)} />
        <StatItem boxed label="Stockpile" value={formatFloat(good.stockpile, 0)} />
        <StatItem boxed label="Demand Cover" value={`${formatFloat(demandCoverage, 1)} mo`} />
        <StatItem
          boxed
          label="Shortfall Cover"
          value={
            shortfallCoverage == null ? "No shortfall" : `${formatFloat(shortfallCoverage, 1)} mo`
          }
        />
        <StatItem boxed label="Impact" value={formatFloat(good.impact, 2)} />
      </div>

      <section>
        <SectionTitle>Where does {good.good.name} come from, and who gets it?</SectionTitle>
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

function MarketGoodSankey({ good }: { good: ScopedGoodSummary }) {
  const option = useMemo((): EChartsOption => buildMarketGoodSankeyOption(good), [good]);
  const hasFlow =
    good.suppliedBreakdown.length > 0 ||
    good.takenBreakdown.length > 0 ||
    good.demandedBreakdown.length > 0;

  if (!hasFlow) {
    return <EmptyNote>No category breakdown is available for this good.</EmptyNote>;
  }

  return <EChart option={option} style={{ height: "360px", width: "100%" }} />;
}

function buildMarketGoodSankeyOption(good: ScopedGoodSummary): EChartsOption {
  const sourcePrefix = "source:";
  const sinkPrefix = "sink:";
  const goodNode = `good:${good.good.name}`;
  const nodes = new Map<string, { name: string; itemStyle?: { color: string } }>();
  const links: { source: string; target: string; value: number }[] = [];
  const addNode = (name: string, color?: string) => {
    nodes.set(name, color ? { name, itemStyle: { color } } : { name });
  };

  addNode(goodNode, chartInk.muted);

  for (const entry of positiveEntries(good.suppliedBreakdown)) {
    const node = `${sourcePrefix}${entry.category}`;
    addNode(node, seriesColor(0));
    links.push({ source: node, target: goodNode, value: entry.amount });
  }

  for (const entry of positiveEntries(good.takenBreakdown)) {
    const node = `${sinkPrefix}${entry.category}`;
    addNode(node, seriesColor(1));
    links.push({ source: goodNode, target: node, value: entry.amount });
  }

  const takenByCategory = new Map(
    good.takenBreakdown.map((entry) => [entry.category, entry.amount]),
  );
  for (const entry of positiveEntries(good.demandedBreakdown)) {
    const unmet = Math.max(0, entry.amount - (takenByCategory.get(entry.category) ?? 0));
    if (unmet <= 0.000001) continue;
    const node = `${sinkPrefix}${entry.category} unmet`;
    addNode(node, divergingPoles.warm);
    links.push({ source: goodNode, target: node, value: unmet });
  }

  const surplus = Math.max(0, good.supply - good.totalTaken);
  if (surplus > 0.000001) {
    const node = `${sinkPrefix}Surplus`;
    addNode(node, divergingPoles.cool);
    links.push({ source: goodNode, target: node, value: surplus });
  }

  return {
    tooltip: {
      ...chartTooltip,
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
          color: chartInk.primary,
          fontSize: 11,
          backgroundColor: chartTooltip.backgroundColor,
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
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
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
        ...chartTooltip,
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
          itemStyle: { color: seriesColor(0), opacity: 0.65 },
        },
        {
          name: "Taken",
          type: "bar",
          encode: { x: "taken", y: "category" },
          itemStyle: { color: seriesColor(1), opacity: 0.8 },
        },
      ],
    };
  }, [rows]);

  if (rows.length === 0) {
    return <EmptyNote>No demand fulfillment breakdown is available for this good.</EmptyNote>;
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
  const saveDate = useEu5SaveDate();
  const data = useMemo(
    () => good.history.map((price, index) => [index - good.history.length + 1, price]),
    [good],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme();
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
    const showZoom = data.length > 40;

    return {
      grid: { left: 60, right: rightGap, top: 20, bottom: showZoom ? 68 : 50 },
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
        ...chartTooltip,
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
      dataZoom: showZoom
        ? [
            { type: "inside", xAxisIndex: 0 },
            { ...chartDataZoomSlider, type: "slider", xAxisIndex: 0, bottom: 0, height: 18 },
          ]
        : undefined,
      series: [
        {
          type: "line",
          data,
          yAxisIndex: 0,
          symbol: "none",
          smooth: true,
          lineStyle: { color: seriesColor(0), width: 2 },
          areaStyle: { color: seriesFill(0) },
          ...(base != null
            ? {
                markLine: {
                  silent: true,
                  symbol: "none",
                  animation: false,
                  data: [{ yAxis: base }],
                  label: {
                    // Avoid the right-side percentage axis.
                    position: "insideStartTop" as const,
                    distance: 2,
                    formatter: `Base: ${formatFloat(base, 2)}`,
                    color: chartInk.muted,
                    fontSize: 10,
                  },
                  lineStyle: {
                    type: "dashed" as const,
                    color: chartInk.muted,
                    width: 1,
                  },
                },
              }
            : {}),
        },
      ],
    };
  }, [data, saveDate, good.defaultMarketPrice, good.history]);

  if (data.length < 2) {
    return <EmptyNote>No price history is available for this good.</EmptyNote>;
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
  const [hoveredGoodKey, setHoveredGoodKey] = useState<string | undefined>(undefined);

  const filtered = useMemo(
    () =>
      goods.filter(
        (g): g is ScopedGoodSummary & { defaultMarketPrice: number } =>
          (g.supply > 0 || g.demand > 0) && g.defaultMarketPrice != null && g.weightedPrice > 0,
      ),
    [goods],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme();
    const arrowColor = chartInk.muted;
    const topMoverKeys = selectGoodsPriceTrajectoryKeys(filtered);
    const data = filtered.map((g) => {
      const isTopMover = topMoverKeys.has(g.good.key);
      return {
        value: [
          ((g.weightedPrice - g.defaultMarketPrice) / g.defaultMarketPrice) * 100,
          g.weightedPrice,
        ] as [number, number],
        key: g.good.key,
        name: g.good.name,
        color: g.good.colorHex,
        base: g.defaultMarketPrice,
        trajectoryPct: goodsPriceTrajectoryPct(g),
        isTopMover,
        itemStyle: {
          color: g.good.colorHex || seriesColor(0),
          opacity: isTopMover ? 0.85 : 0.35,
        },
      };
    });
    const arrowData = buildGoodsPriceArrowData(filtered);
    const series: EChartsOption["series"] = [
      {
        type: "custom",
        silent: true,
        z: 5,
        data: arrowData,
        renderItem: (params, api) => {
          const { dataIndex } = params;
          const d = arrowData[dataIndex];
          if (!d) return null;

          const startPt = api.coord([d.startX, d.y]);
          const endPt = api.coord([d.endX, d.y]);
          const direction = d.endX >= d.startX ? 1 : -1;
          const symbolRadius = d.key === selectedGoodKey ? 7 : 4;
          const headLength = 8;
          const headHalfHeight = 4;
          const lineStartX = startPt[0] + direction * symbolRadius;
          const headBaseX = endPt[0] - direction * headLength;
          const hasLineBody = direction * (headBaseX - lineStartX) > 0;
          const line = {
            type: "line" as const,
            shape: {
              x1: lineStartX,
              y1: startPt[1],
              x2: headBaseX,
              y2: endPt[1],
            },
            style: {
              stroke: arrowColor,
              lineWidth: 1.5,
              opacity: 0.9,
            },
          };

          return {
            type: "group",
            children: [
              ...(hasLineBody ? [line] : []),
              {
                type: "polygon" as const,
                shape: {
                  points: [
                    [endPt[0], endPt[1]],
                    [headBaseX, endPt[1] - headHalfHeight],
                    [headBaseX, endPt[1] + headHalfHeight],
                  ],
                },
                style: {
                  fill: arrowColor,
                  opacity: 0.9,
                },
              },
            ],
          };
        },
      },
      {
        type: "custom" as const,
        selectedMode: false,
        data,
        markLine: {
          silent: true,
          symbol: "none",
          animation: false,
          data: [{ xAxis: 0 }],
          lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
          label: { show: false },
        },
        renderItem: (params, api) => {
          const { dataIndex } = params;
          const d = data[dataIndex];
          if (!d) return undefined;

          const point = api.coord(d.value as [number, number]);
          const ICON_SIZE = 16;
          const half = ICON_SIZE / 2;
          const x = point[0] - half;
          const y = point[1] - half;
          const isSelected = d.key === selectedGoodKey;
          const highlightColor = (d.color as string | undefined) || selectionColor;

          let atlasIndex = goodsAtlasData[d.key as string];
          if (atlasIndex === undefined) atlasIndex = goodsAtlasData["_default"];

          const SCALE = ICON_SIZE / GOODS_CELL_SIZE_32;
          const atlasTotalW = goodsDimensions32.cols * ICON_SIZE;
          const atlasTotalH = goodsDimensions32.rows * ICON_SIZE;

          const iconOpacity = isSelected || d.isTopMover || d.key === hoveredGoodKey ? 1 : 0.35;

          const makeIconEl = () => {
            if (atlasIndex !== undefined) {
              const { row, col } = goodsDimensions32.coordinates(atlasIndex);
              const spriteX = col * GOODS_CELL_SIZE_32 * SCALE;
              const spriteY = row * GOODS_CELL_SIZE_32 * SCALE;
              return {
                type: "group" as const,
                x,
                y,
                clipPath: {
                  type: "rect" as const,
                  shape: { x: 0, y: 0, width: ICON_SIZE, height: ICON_SIZE },
                },
                children: [
                  {
                    type: "image" as const,
                    style: {
                      image: goodsAtlasUrl32,
                      x: -spriteX,
                      y: -spriteY,
                      width: atlasTotalW,
                      height: atlasTotalH,
                      opacity: iconOpacity,
                    },
                  },
                ],
              };
            }
            return {
              type: "circle" as const,
              shape: { cx: point[0], cy: point[1], r: half },
              style: { fill: d.itemStyle.color as string, opacity: iconOpacity },
            };
          };

          return {
            type: "group" as const,
            children: [
              {
                type: "rect" as const,
                shape: { x: x - 4, y: y - 4, width: ICON_SIZE + 8, height: ICON_SIZE + 8, r: 4 },
                style: {
                  fill: "none",
                  stroke: highlightColor,
                  lineWidth: 2,
                  opacity: isSelected ? 1 : 0,
                  shadowBlur: isSelected ? 8 : 0,
                  shadowColor: highlightColor,
                },
              },
              makeIconEl(),
            ],
          };
        },
      },
    ];

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
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as (typeof data)[number];
          const pct =
            ((d.value[0] as number) >= 0 ? "+" : "") + formatFloat(d.value[0] as number, 1);
          const trajectory =
            d.trajectoryPct == null
              ? undefined
              : `${d.trajectoryPct >= 0 ? "+" : ""}${formatFloat(d.trajectoryPct, 2)}% base/mo`;
          return [
            `<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle">${goodsIconHtml(d.key)}<strong>${escapeEChartsHtml(d.name)}</strong></span>`,
            `Current Price: ${formatFloat(d.value[1] as number, 3)}`,
            `Base Price: ${formatFloat(d.base, 3)}`,
            `vs Base: ${pct}%`,
            ...(trajectory == null ? [] : [`Trajectory: ${trajectory}`]),
          ].join("<br/>");
        },
      },
      series,
    };
  }, [filtered, selectedGoodKey, hoveredGoodKey]);

  if (filtered.length === 0) {
    return <EmptyNote>No goods with base price data in the selected scope.</EmptyNote>;
  }

  const handlePriceMouseover = useEffectEvent((params: { dataIndex?: number }) => {
    const good = filtered[params.dataIndex ?? -1];
    if (good) setHoveredGoodKey(good.good.key);
  });

  const handlePriceClick = useEffectEvent((params: { dataIndex?: number }) => {
    const good = filtered[params.dataIndex ?? -1];
    if (good) onGoodSelect?.(good);
  });

  return (
    <EChart
      option={option}
      style={{ height: "320px", width: "100%" }}
      onInit={(chart) => {
        chart.on("mouseover", handlePriceMouseover);
        chart.on("mouseout", () => setHoveredGoodKey(undefined));
        if (onGoodSelect) {
          chart.on("click", handlePriceClick);
        }
      }}
    />
  );
}

function marketTooltip(d: ScopedMarketSummary): string {
  return [
    `<strong>${escapeEChartsHtml(d.market.market.name)}</strong>`,
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
  const topMarkets = useMemo(
    () =>
      new Set(
        [...markets]
          .sort((a, b) => b.marketValue - a.marketValue)
          .slice(0, 8)
          .map((m) => m.market.market.key),
      ),
    [markets],
  );

  const maxTaken = useMemo(() => Math.max(1, ...markets.map((m) => m.totalTaken)), [markets]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      grid: { left: 80, right: 60, top: 20, bottom: 76 },
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
        { ...chartDataZoomSlider, type: "slider", xAxisIndex: 0, bottom: 0, height: 20 },
      ],
      tooltip: {
        ...chartTooltip,
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
              return d?.market.colorHex ?? seriesColor(0);
            },
            opacity: 0.75,
          },
          label: {
            show: true,
            formatter: (params) => {
              const d = markets[params.dataIndex];
              if (!d) return "";
              return topMarkets.has(d.market.market.key) || markets.length <= 10
                ? d.market.market.name.replace(/ Market$/, "")
                : "";
            },
            position: "top",
            color: chartInk.primary,
            fontSize: 10,
            fontWeight: 600,
            distance: 4,
          },
        },
      ],
    };
  }, [markets, topMarkets, maxTaken]);

  const handleInit = useEu5EntityChartClick({
    kind: "market",
    backLabel: "Markets",
    getTarget: (params) => {
      const dataIndex = params.dataIndex;
      const market = dataIndex == null ? null : markets[dataIndex];
      return market
        ? {
            id: market.market.market.key,
            anchorLocationIdx: market.market.anchorLocationIdx,
            label: market.market.market.name,
          }
        : null;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}
