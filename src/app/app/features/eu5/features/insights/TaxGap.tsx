import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryTaxGap } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { TaxGapTopLocations } from "./TaxGapTopLocations";
import { RealizationHistogram } from "./RealizationHistogram";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../profiles/components/StatItem";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";

const BAR_CAP = 25;

function TaxGapScopeHeader() {
  const { data, error, loading } = useEu5SelectionTrigger((engine) =>
    engine.trigger.getTaxGapScope(),
  );

  if (loading && !data) {
    return <InsightScopeHeaderSkeleton />;
  }

  if (error && !data) return <Eu5InsightErrorState error={error} />;
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
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length >= 1 && (
            <section>
              <SectionTitle>Tax Gap by Country</SectionTitle>
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

          {countries.length === 0 && !insightQuery.data?.distribution && (
            <Eu5InsightEmptyState title="No tax gap in the selected scope." />
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

type ScatterDatum = [x: number, y: number];

function countryTooltip(d: CountryTaxGap): string {
  return [
    `<strong>${escapeEChartsHtml(d.country.country.name)}</strong> (${escapeEChartsHtml(d.country.tag)})`,
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
    (): CountryTaxGap[] => [...countries].sort((a, b) => b.taxGap - a.taxGap),
    [countries],
  );

  const hasGap = sorted.some((d) => d.taxGap !== 0);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    const showZoom = sorted.length > BAR_CAP;

    return {
      grid: {
        left: 60,
        right: 70,
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
        data: sorted.map((d) => d.country.tag),
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
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as CountryTaxGap & { value: number };
          return countryTooltip(d);
        },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((d) => ({ ...d, value: d.taxGap })),
          itemStyle: {
            color: (params) => {
              const d = params.data as CountryTaxGap & { value: number };
              return d.taxGap >= 0
                ? isDark
                  ? "#38bdf8"
                  : "#0ea5e9"
                : isDark
                  ? "#fbbf24"
                  : "#f59e0b";
            },
          },
          label: {
            show: true,
            position: "right",
            formatter: (params) => {
              const d = params.data as CountryTaxGap & { value: number };
              return `${formatFloat(d.realizationRatio * 100, 1)}%`;
            },
            fontSize: 10,
            fontWeight: 600,
            color: tickColor,
          },
        },
      ],
    };
  }, [sorted, isDark]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    backLabel: "Tax Gap",
    getTarget: (params) => {
      const dataIndex = params.dataIndex;
      const x = dataIndex == null ? null : sorted[dataIndex];
      return x
        ? {
            id: x.country.country.key,
            anchorLocationIdx: x.country.anchorLocationIdx,
            label: x.country.country.name,
          }
        : null;
    },
  });

  if (!hasGap) {
    return (
      <p className="py-6 text-center text-sm text-game-ink-500">No tax gap in the selected scope</p>
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
    () => new Set(countries.slice(0, 10).map((c) => c.country.tag)),
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
            `<strong>${escapeEChartsHtml(d.country.country.name)}</strong> (${escapeEChartsHtml(d.country.tag)})`,
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
              return d?.country.colorHex ?? (isDark ? "#93c5fd" : "#3b82f6");
            },
            opacity: 0.8,
          },
          label: {
            show: true,
            formatter: (params) => {
              const d = countries[params.dataIndex];
              return d && (topCountries.has(d.country.tag) || countries.length <= 5)
                ? d.country.tag
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
  }, [scatterData, topCountries, isDark, countries, diagonalMax]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    backLabel: "Tax Gap",
    getTarget: (params) => {
      const dataIndex = params.dataIndex;
      const countryRef = dataIndex == null ? null : countries[dataIndex]?.country;
      return countryRef
        ? {
            id: countryRef.country.key,
            anchorLocationIdx: countryRef.anchorLocationIdx,
            label: countryRef.country.name,
          }
        : null;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}
