import { insightFlow } from "../../stack/levelBody";
import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
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
import { LocationDistributionChart } from "./LocationDistributionChart";
import { DevelopmentTopLocations } from "./DevelopmentTopLocations";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import {
  countryDotSeries,
  useScatterMarks,
  logAxis,
  logDomain,
  LogFloorNote,
  scatterDots,
} from "./countryScatter";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { SectionTitle } from "../../components";
import { useChartExport } from "../../stack/chartExport";

function DevelopmentScopeHeader({ data }: { data?: DevelopmentInsightData }) {
  if (!data) return <InsightReadoutSkeleton />;

  return (
    <InsightReadout figure={formatMetric(data.scope.totalDevelopment)} unit="total development">
      <ReadoutFigure value={formatMetric(data.scope.avgDevelopment)} label="avg / location" />
      <ReadoutFigure value={formatMetric(data.distribution.median)} label="median / location" />
    </InsightReadout>
  );
}

export function DevelopmentInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.queries.getDevelopmentInsight());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className={insightFlow}>
      <DevelopmentScopeHeader data={insightQuery.data} />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length >= 2 && (
            <section>
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
  const chartImage = useChartExport("Development by country");
  const { selected, home, namePlayers, plot, track } = useScatterMarks();
  const domain = useMemo(() => logDomain(countries.map((c) => c.locationCount)), [countries]);

  const scatterData = useMemo(
    () =>
      scatterDots(
        countries.map((c) => ({
          x: c.locationCount,
          size: c.totalDevelopment,
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
        home,
        namePlayers,
      ),
    [countries, domain, selected, home, namePlayers],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      grid: { ...chartGutter, top: 28, bottom: 52 },
      xAxis: logAxis(domain, "Locations"),
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
      series: [countryDotSeries(scatterData, plot)],
    };
  }, [scatterData, domain, plot]);

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
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Development by country</SectionTitle>
        {chartImage.button}
      </div>
      <EChart
        option={option}
        style={{ height: "max(420px, 56vh)", width: "100%" }}
        onInit={(chart) => {
          handleInit(chart);
          chartImage.track(chart);
          track(chart);
        }}
      />
      <LogFloorNote
        domain={domain}
        what="development"
        axis="Further right: more land. Higher: richer land per location."
      />
    </>
  );
}
