import { useCallback, useEffectEvent, useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryPossibleTax } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { useEu5Engine } from "../../store";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { PossibleTaxTopLocations } from "./PossibleTaxTopLocations";
import { usePanToEntity } from "../../usePanToEntity";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../../EntityProfile/components/StatItem";
import type * as echarts from "echarts/core";

function PossibleTaxScopeHeader() {
  const { data, loading } = useEu5SelectionTrigger((engine) =>
    engine.trigger.getPossibleTaxScope(),
  );

  if (loading && !data) return <InsightScopeHeaderSkeleton />;
  if (!data) return null;

  return (
    <InsightScopeHeader>
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem label="Total Possible Tax" value={formatInt(data.totalPossibleTax)} />
      <StatItem label="Avg per Location" value={formatFloat(data.avgPossibleTax, 2)} />
    </InsightScopeHeader>
  );
}

export function PossibleTaxInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getPossibleTaxInsight());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <PossibleTaxScopeHeader />
      {insightQuery.loading && !insightQuery.data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          {countries.length >= 2 && (
            <section>
              <SectionTitle>Possible Tax · Total vs Average per Location</SectionTitle>
              <PossibleTaxScatterChart countries={countries} />
            </section>
          )}

          {insightQuery.data?.distribution && (
            <section>
              <LocationDistributionChart distribution={insightQuery.data.distribution} />
            </section>
          )}

          {insightQuery.data && insightQuery.data.topLocations.length > 0 && (
            <section>
              <SectionTitle>Top Possible-Tax Locations</SectionTitle>
              <PossibleTaxTopLocations locations={insightQuery.data.topLocations} />
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

function PossibleTaxScatterChart({ countries }: { countries: CountryPossibleTax[] }) {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  const isDark = isDarkMode();

  const topCountries = useMemo(
    () => new Set(countries.slice(0, 10).map((c) => c.tag)),
    [countries],
  );

  const scatterData = useMemo(
    () =>
      countries.map((c) => ({
        value: [c.totalPossibleTax, c.avgPossibleTax] as [number, number],
        tag: c.tag,
        name: c.name,
        locationCount: c.locationCount,
        totalPossibleTax: c.totalPossibleTax,
        avgPossibleTax: c.avgPossibleTax,
        totalPopulation: c.totalPopulation,
        color: c.colorHex,
        anchorLocationIdx: c.anchorLocationIdx,
      })),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      grid: { left: 80, right: 60, top: 20, bottom: 60 },
      xAxis: {
        type: "value",
        name: "Total Possible Tax",
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
        name: "Avg Possible Tax per Location",
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
          const d = params.data as (typeof scatterData)[number];
          return [
            `<strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})`,
            `Total Possible Tax: ${formatFloat(d.totalPossibleTax, 2)}`,
            `Avg per Location: ${formatFloat(d.avgPossibleTax, 2)}`,
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
              if (Array.isArray(params)) return isDark ? "#93c5fd" : "#3b82f6";
              const d = params.data as (typeof scatterData)[number];
              return d.color ?? (isDark ? "#93c5fd" : "#3b82f6");
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
            color: isDark ? "#e2e8f0" : "#1e293b",
            fontSize: 10,
            fontWeight: 600,
            distance: 4,
          },
        },
      ],
    };
  }, [scatterData, topCountries, isDark, countries.length]);

  const handleClick = useEffectEvent((params: echarts.ECElementEvent) => {
    if (Array.isArray(params.data)) return;
    const d = params.data as (typeof scatterData)[number];
    if (d?.anchorLocationIdx == null) return;
    const idx = d.anchorLocationIdx;
    if ((params.event?.event as MouseEvent)?.shiftKey) {
      void engine.trigger.addCountry(idx);
    } else if ((params.event?.event as MouseEvent)?.altKey) {
      void engine.trigger.removeCountry(idx);
    } else {
      void engine.trigger.selectCountry(idx);
      panToEntity(idx);
    }
  });

  const handleInit = useCallback((chart: echarts.ECharts) => {
    chart.on("click", handleClick);
  }, []);

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}
