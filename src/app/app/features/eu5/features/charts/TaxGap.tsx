import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryTaxGap } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { TaxGapTopLocations } from "./TaxGapTopLocations";
import { RealizationHistogram } from "./RealizationHistogram";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../../EntityProfile/components/StatItem";
import { useEu5EntityChartClick } from "./useEntityChartClick";

const BAR_CAP = 25;

function TaxGapScopeHeader() {
  const { data, loading } = useEu5SelectionTrigger((engine) => engine.trigger.getTaxGapScope());

  if (loading && !data) {
    return <InsightScopeHeaderSkeleton />;
  }

  if (!data) return null;

  return (
    <InsightScopeHeader>
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem label="Tax Gap" value={formatInt(data.taxGap)} />
      <StatItem label="Realization" value={`${formatFloat(data.realizationRatio * 100, 1)}%`} />
    </InsightScopeHeader>
  );
}

export function TaxGapInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getTaxGapInsight());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <TaxGapScopeHeader />
      {insightQuery.loading && !insightQuery.data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          {countries.length >= 1 && (
            <section>
              <SectionTitle>Tax Gap · Realized vs Ceiling per Country</SectionTitle>
              <TaxGapBarChart countries={countries} />
            </section>
          )}

          {countries.length >= 2 && (
            <section>
              <SectionTitle>By Scale · Current vs Possible Tax</SectionTitle>
              <TaxGapScatterChart countries={countries} />
            </section>
          )}

          {countries.length >= 10 && (
            <section>
              <SectionTitle>Realization Distribution</SectionTitle>
              <RealizationHistogram countries={countries} />
            </section>
          )}

          {insightQuery.data?.distribution && (
            <section>
              <LocationDistributionChart distribution={insightQuery.data.distribution} />
            </section>
          )}

          {insightQuery.data && insightQuery.data.topLocations.length > 0 && (
            <section>
              <SectionTitle>Top Tax-Gap Locations</SectionTitle>
              <TaxGapTopLocations locations={insightQuery.data.topLocations} />
            </section>
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

type BarDatum = CountryTaxGap & {
  matched: number;
  untapped: number;
  overperformed: number;
};

type ScatterDatum = [x: number, y: number];

function countryTooltip(d: CountryTaxGap): string {
  return [
    `<strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})`,
    `Location Tax: ${formatFloat(d.currentTaxBase, 2)}`,
    `Possible Tax: ${formatFloat(d.totalPossibleTax, 2)}`,
    `Gap: ${formatFloat(d.taxGap, 2)}`,
    `Realization: ${formatFloat(d.realizationRatio * 100, 1)}%`,
    `Locations: ${formatInt(d.locationCount)}`,
    `Population: ${formatInt(d.totalPopulation)}`,
  ].join("<br/>");
}

function TaxGapBarChart({ countries }: { countries: CountryTaxGap[] }) {
  const isDark = isDarkMode();

  const sorted = useMemo(
    (): BarDatum[] =>
      [...countries]
        .sort((a, b) => b.taxGap - a.taxGap)
        .map((c) => ({
          ...c,
          matched: c.currentTaxBase,
          untapped: Math.max(0, c.taxGap),
          overperformed: -Math.max(0, -c.taxGap),
        })),
    [countries],
  );

  const hasGap = sorted.some((d) => d.taxGap !== 0);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    const showZoom = sorted.length > BAR_CAP;

    return {
      dataset: {
        source: sorted,
        dimensions: [
          "name",
          "tag",
          "currentTaxBase",
          "totalPossibleTax",
          "taxGap",
          "realizationRatio",
          "locationCount",
          "totalPopulation",
          "anchorLocationIdx",
          "colorHex",
          "matched",
          "untapped",
          "overperformed",
        ],
      },
      grid: {
        left: 60,
        right: 20,
        top: 10,
        bottom: showZoom ? 30 : 10,
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
        axisLabel: { color: tickColor, fontSize: 11, fontWeight: 600, width: 44 },
        axisLine: { lineStyle: { color: axisColor } },
      },
      ...(showZoom
        ? {
            dataZoom: [
              {
                type: "slider",
                yAxisIndex: 0,
                startValue: 0,
                endValue: BAR_CAP - 1,
                width: 14,
                right: 4,
                textStyle: { color: tickColor },
                filterMode: "filter",
              },
            ],
          }
        : {}),
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
          return countryTooltip(d);
        },
      },
      series: [
        {
          name: "Location Tax",
          type: "bar",
          stack: "tax",
          encode: { x: "matched", y: "tag" },
          itemStyle: { color: isDark ? "#475569" : "#94a3b8" },
          emphasis: { focus: "series" },
        },
        {
          name: "Untapped",
          type: "bar",
          stack: "tax",
          encode: { x: "untapped", y: "tag" },
          itemStyle: { color: isDark ? "#38bdf8" : "#0ea5e9" },
          emphasis: { focus: "series" },
        },
        {
          name: "Over-realized",
          type: "bar",
          stack: "tax",
          encode: { x: "overperformed", y: "tag" },
          itemStyle: { color: isDark ? "#fbbf24" : "#f59e0b" },
          emphasis: { focus: "series" },
        },
      ],
    };
  }, [sorted, isDark]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getAnchorLocationIdx: (params) => {
      const dataIndex = params.dataIndex;
      return dataIndex == null ? null : sorted[dataIndex]?.anchorLocationIdx;
    },
  });

  if (!hasGap) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">No tax gap in the selected scope</p>
    );
  }

  const height = Math.min(sorted.length, BAR_CAP) * 18 + 60;

  return (
    <EChart option={option} style={{ height: `${height}px`, width: "100%" }} onInit={handleInit} />
  );
}

function TaxGapScatterChart({ countries }: { countries: CountryTaxGap[] }) {
  const isDark = isDarkMode();

  const topCountries = useMemo(
    () => new Set(countries.slice(0, 10).map((c) => c.tag)),
    [countries],
  );

  const scatterData = useMemo(
    (): ScatterDatum[] => countries.map((c) => [c.currentTaxBase, c.totalPossibleTax]),
    [countries],
  );

  const diagonalMax = useMemo(() => {
    const maxVal = Math.max(
      ...countries.map((c) => Math.max(c.currentTaxBase, c.totalPossibleTax)),
    );
    return maxVal > 0 ? maxVal : 1;
  }, [countries]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      grid: { left: 80, right: 60, top: 20, bottom: 60 },
      xAxis: {
        type: "value",
        name: "Location Tax",
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
        name: "Total Possible Tax (ceiling)",
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
          const d = countries[dataIndex];
          if (!d) return "";
          return [
            `<strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})`,
            `Location Tax: ${formatFloat(d.currentTaxBase, 2)}`,
            `Possible Tax: ${formatFloat(d.totalPossibleTax, 2)}`,
            `Gap: ${formatFloat(d.taxGap, 2)}`,
            `Realization: ${formatFloat(d.realizationRatio * 100, 1)}%`,
            `Locations: ${formatInt(d.locationCount)}`,
            `Population: ${formatInt(d.totalPopulation)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          // y = x diagonal: countries on this line have current ≈ possible tax
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
          symbolSize: (_val, params) => {
            const d = countries[params.dataIndex];
            return d ? Math.max(6, Math.min(28, Math.sqrt(d.locationCount))) : 6;
          },
          itemStyle: {
            color: (params) => {
              const d = countries[params.dataIndex];
              return d?.colorHex ?? (isDark ? "#93c5fd" : "#3b82f6");
            },
            opacity: 0.8,
          },
          label: {
            show: true,
            formatter: (params) => {
              const d = countries[params.dataIndex];
              return d && (topCountries.has(d.tag) || countries.length <= 5) ? d.tag : "";
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
  }, [scatterData, topCountries, isDark, countries, diagonalMax]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getAnchorLocationIdx: (params) => {
      const dataIndex = params.dataIndex;
      return dataIndex == null ? null : countries[dataIndex]?.anchorLocationIdx;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}
