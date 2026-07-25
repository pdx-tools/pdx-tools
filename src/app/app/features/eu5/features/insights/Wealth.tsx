import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryWealth } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartDataZoomSlider,
  chartInk,
  chartTooltip,
  getEChartsTheme,
  seriesColor,
} from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { WealthTopLocations } from "./WealthTopLocations";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { SectionTitle, StatItem } from "../../components";

function WealthScopeHeader() {
  const { data, error, loading } = useEu5SelectionTrigger((engine) =>
    engine.trigger.getWealthScope(),
  );

  if (loading && !data) return <InsightScopeHeaderSkeleton />;
  if (error && !data) return <Eu5InsightErrorState error={error} />;
  if (!data) return null;

  return (
    <InsightScopeHeader>
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem label="Total Wealth" value={formatInt(data.totalWealth)} />
      <StatItem label="Avg per Location" value={formatFloat(data.avgWealth, 2)} />
    </InsightScopeHeader>
  );
}

export function WealthInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getWealthInsight());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <WealthScopeHeader />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length >= 2 && (
            <section>
              <SectionTitle>Wealth · Total vs Average per Location</SectionTitle>
              <WealthScatterChart countries={countries} />
            </section>
          )}

          {insightQuery.data?.distribution && (
            <section>
              <LocationDistributionChart distribution={insightQuery.data.distribution} />
            </section>
          )}

          {insightQuery.data && insightQuery.data.topLocations.length > 0 && (
            <section>
              <SectionTitle>Top Wealth Locations</SectionTitle>
              <WealthTopLocations locations={insightQuery.data.topLocations} />
            </section>
          )}

          {countries.length === 0 && !insightQuery.data?.distribution && (
            <Eu5InsightEmptyState title="No wealth data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}

function WealthScatterChart({ countries }: { countries: CountryWealth[] }) {
  const topCountries = useMemo(
    () => new Set(countries.slice(0, 10).map((c) => c.country.tag)),
    [countries],
  );

  const scatterData = useMemo(
    () =>
      countries.map((c) => ({
        value: [c.totalWealth, c.avgWealth] as [number, number],
        tag: c.country.tag,
        name: c.country.country.name,
        locationCount: c.locationCount,
        totalWealth: c.totalWealth,
        avgWealth: c.avgWealth,
        totalPopulation: c.totalPopulation,
        color: c.country.colorHex,
        id: c.country.country.key,
        anchorLocationIdx: c.country.anchorLocationIdx,
      })),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      grid: { left: 80, right: 60, top: 20, bottom: 76 },
      xAxis: {
        type: "value",
        name: "Total Wealth",
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
        name: "Avg Wealth per Location",
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
          const d = params.data as (typeof scatterData)[number];
          return [
            `<strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})`,
            `Total Wealth: ${formatFloat(d.totalWealth, 2)}`,
            `Avg per Location: ${formatFloat(d.avgWealth, 2)}`,
            `Locations: ${formatInt(d.locationCount)}`,
            `Population: ${formatInt(d.totalPopulation)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 8,
          itemStyle: {
            color: (params) => {
              if (Array.isArray(params)) return seriesColor(0);
              const d = params.data as (typeof scatterData)[number];
              return d.color ?? seriesColor(0);
            },
            opacity: 0.8,
          },
          label: {
            show: true,
            formatter: (params) => {
              if (Array.isArray(params)) return "";
              const d = params.data as (typeof scatterData)[number];
              return topCountries.has(d.tag) || countries.length <= 5 ? d.tag : "";
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
  }, [scatterData, topCountries, countries.length]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    backLabel: "Wealth",
    getTarget: (params) => {
      if (Array.isArray(params.data)) return null;
      const country = params.data as (typeof scatterData)[number] | undefined;
      return country
        ? { id: country.id, anchorLocationIdx: country.anchorLocationIdx, label: country.name }
        : null;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}
