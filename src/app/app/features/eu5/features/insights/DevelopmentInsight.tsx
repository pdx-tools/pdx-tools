import ChevronRightIcon from "@heroicons/react/20/solid/ChevronRightIcon";
import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { GameButton } from "@/components/game/Button";
import type { CountryDevSummary, DevelopmentInsightData } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt, formatMetric } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartTooltip,
  getEChartsTheme,
  chartGutter,
  yAxisName,
} from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { useEu5Engine, useEu5Players } from "../../store";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { DevelopmentTopLocations } from "./DevelopmentTopLocations";
import {
  InsightReadout,
  InsightReadoutSkeleton,
  ReadoutFigure,
  readoutAction,
} from "../InsightReadout";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useSelectedCountries } from "../../stack/selected";
import { countryDotSeries, logAxis, logDomain, LogFloorNote, scatterDots } from "./countryScatter";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { SectionTitle } from "../../components";

function DevelopmentScopeHeader({ data }: { data?: DevelopmentInsightData }) {
  const engine = useEu5Engine();
  if (!data) return <InsightReadoutSkeleton />;

  return (
    <InsightReadout
      figure={formatMetric(data.scope.totalDevelopment)}
      unit="total development"
      action={
        <GameButton
          variant="ghost"
          className={readoutAction}
          onClick={() => engine.trigger.selectMapMode("stateEfficacy")}
        >
          Effective Development
          <ChevronRightIcon aria-hidden className="h-3.5 w-3.5" />
        </GameButton>
      }
    >
      <ReadoutFigure value={formatMetric(data.scope.avgDevelopment)} label="avg / location" />
      <ReadoutFigure value={formatMetric(data.distribution.median)} label="median / location" />
    </InsightReadout>
  );
}

export function DevelopmentInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.queries.getDevelopmentInsight());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-3.5">
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
  const selected = useSelectedCountries();
  const multiplayer = useEu5Players().length > 1;
  const domain = useMemo(() => logDomain(countries.map((c) => c.totalDevelopment)), [countries]);

  const scatterData = useMemo(
    () =>
      scatterDots(
        countries.map((c) => ({
          x: c.totalDevelopment,
          y: c.avgDevelopment,
          tag: c.country.tag,
          name: c.country.country.name,
          locationCount: c.locationCount,
          totalDevelopment: c.totalDevelopment,
          avgDevelopment: c.avgDevelopment,
          totalPopulation: c.totalPopulation,
          color: c.country.colorHex,
          player: c.country.isPlayer,
          id: c.country.country.key,
          anchorLocationIdx: c.country.anchorLocationIdx,
        })),
        domain,
        selected,
        multiplayer,
      ),
    [countries, domain, selected, multiplayer],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      grid: { ...chartGutter, top: 28, bottom: 52 },
      xAxis: logAxis(domain, "Total Development"),
      yAxis: {
        type: "value",
        ...yAxisName("Avg Dev per Location"),
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
      },
      dataZoom: [{ type: "inside", xAxisIndex: 0, yAxisIndex: 0 }],
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as (typeof scatterData)[number];
          return [
            `<strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})`,
            `Total Dev: ${formatFloat(d.totalDevelopment, 1)}`,
            `Avg per Location: ${formatFloat(d.avgDevelopment, 2)}`,
            `Locations: ${formatInt(d.locationCount)}`,
            `Population: ${formatInt(d.totalPopulation)}`,
          ].join("<br/>");
        },
      },
      series: [{ ...countryDotSeries(), data: scatterData }],
    };
  }, [scatterData, domain]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getTarget: (params) => {
      if (Array.isArray(params.data)) return null;
      const country = params.data as (typeof scatterData)[number] | undefined;
      return country
        ? { id: country.id, anchorLocationIdx: country.anchorLocationIdx, label: country.name }
        : null;
    },
  });

  return (
    <>
      <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />
      <LogFloorNote domain={domain} what="development" />
    </>
  );
}
