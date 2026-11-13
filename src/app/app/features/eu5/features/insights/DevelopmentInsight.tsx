import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { GameButton } from "@/components/game/Button";
import type { CountryDevSummary, DevelopmentInsightData } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { formatExact } from "../../numberFormatting";
import { Figure } from "../../components/Figure";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartDataZoomSlider,
  chartText,
  chartTooltip,
  seriesColor,
  yAxisName,
  labelHalo,
} from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { useEu5Engine } from "../../store";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { DevelopmentTopLocations } from "./DevelopmentTopLocations";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { SectionTitle } from "../../components";

function DevelopmentScopeHeader({ data }: { data?: DevelopmentInsightData }) {
  const engine = useEu5Engine();
  if (!data) return <InsightReadoutSkeleton />;

  return (
    <InsightReadout
      figure={<Figure value={data.scope.totalDevelopment} />}
      unit="total development"
      action={
        <GameButton
          variant="ghost"
          className="-mr-3 shrink-0"
          onClick={() => engine.trigger.selectMapMode("stateEfficacy")}
        >
          Effective Development
          <span aria-hidden="true">→</span>
        </GameButton>
      }
    >
      <ReadoutFigure value={<Figure value={data.scope.avgDevelopment} />} label="avg / location" />
      <ReadoutFigure
        value={<Figure value={data.distribution.median} />}
        label="median / location"
      />
    </InsightReadout>
  );
}

export function DevelopmentInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.queries.getDevelopmentInsight());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <DevelopmentScopeHeader data={insightQuery.data} />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length >= 2 && (
            <section>
              <SectionTitle>Development by country</SectionTitle>
              <DevelopmentScatterChart countries={countries} />
            </section>
          )}

          {insightQuery.data?.distribution && (
            <section>
              <LocationDistributionChart distribution={insightQuery.data.distribution} />
            </section>
          )}

          {insightQuery.data && insightQuery.data.topLocations.length > 0 && (
            <section>
              <SectionTitle>Top Development Locations</SectionTitle>
              <DevelopmentTopLocations locations={insightQuery.data.topLocations} />
            </section>
          )}

          {countries.length === 0 && !insightQuery.data?.distribution && (
            <Eu5InsightEmptyState title="No development data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}

function DevelopmentScatterChart({ countries }: { countries: CountryDevSummary[] }) {
  const topCountries = useMemo(
    () => new Set(countries.slice(0, 10).map((c) => c.country.tag)),
    [countries],
  );

  const scatterData = useMemo(
    () =>
      countries.map((c) => ({
        value: [c.totalDevelopment, c.avgDevelopment] as [number, number],
        tag: c.country.tag,
        name: c.country.country.name,
        locationCount: c.locationCount,
        totalDevelopment: c.totalDevelopment,
        avgDevelopment: c.avgDevelopment,
        totalPopulation: c.totalPopulation,
        color: c.country.colorHex,
        id: c.country.country.key,
        anchorLocationIdx: c.country.anchorLocationIdx,
      })),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    return {
      grid: { left: 56, right: 60, top: 32, bottom: 76 },
      xAxis: {
        type: "value",
        name: "Total Development",
        nameLocation: "middle",
        nameGap: 40,
        min: 0,
      },
      yAxis: {
        type: "value",
        ...yAxisName("Avg Dev per Location"),
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
            `Total Dev: ${formatExact(d.totalDevelopment)}`,
            `Avg per Location: ${formatExact(d.avgDevelopment)}`,
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
            ...chartText,
            ...labelHalo,
            position: "top",
            distance: 4,
          },
        },
      ],
    };
  }, [scatterData, topCountries, countries.length]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    backLabel: "Development",
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
