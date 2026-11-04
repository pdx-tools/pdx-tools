import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryWealth } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt, formatMetric, formatPercent as formatShare } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartTooltip,
  getEChartsTheme,
  chartGutter,
  yAxisName,
} from "@/components/viz/echartsTheme";
import { useEu5Players } from "../../store";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { WealthTopLocations } from "./WealthTopLocations";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import { ConcentrationCurve } from "./ConcentrationCurve";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useSelectedCountries } from "../../stack/selected";
import { countryDotSeries, logAxis, logDomain, LogFloorNote, scatterDots } from "./countryScatter";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { SectionTitle } from "../../components";

const formatWealthValue = (value: number) => formatFloat(value, 1);

function WealthScopeHeader() {
  const { data, error, loading } = useEu5SelectionTrigger((engine) =>
    engine.queries.getWealthScope(),
  );

  if (loading && !data) return <InsightReadoutSkeleton />;
  if (error && !data) return <Eu5InsightErrorState error={error} />;
  if (!data) return null;

  // Wealth is heavy-tailed, so the ledger says what a typical location has
  // and how much sits in the few richest, not the mean nobody is near.
  return (
    <InsightReadout figure={formatMetric(data.totalWealth)} unit="total wealth">
      <ReadoutFigure value={formatMetric(data.medianWealth)} label="median / location" />
      <ReadoutFigure value={formatShare(data.topDecileShare)} label="in the top 10% of locations" />
    </InsightReadout>
  );
}

export function WealthInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.queries.getWealthInsight());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-3.5">
      <WealthScopeHeader />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length >= 2 && (
            <section>
              <SectionTitle>Wealth by country</SectionTitle>
              <WealthScatterChart countries={countries} />
            </section>
          )}

          {insightQuery.data?.distribution && (
            <section>
              <LocationDistributionChart distribution={insightQuery.data.distribution} />
            </section>
          )}

          {insightQuery.data && insightQuery.data.concentration.length > 1 && (
            <section>
              <SectionTitle>Wealth concentration</SectionTitle>
              <ConcentrationCurve
                points={insightQuery.data.concentration}
                metric="wealth"
                formatValue={formatWealthValue}
              />
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
  const selected = useSelectedCountries();
  const multiplayer = useEu5Players().length > 1;
  const domain = useMemo(() => logDomain(countries.map((c) => c.totalWealth)), [countries]);

  const scatterData = useMemo(
    () =>
      scatterDots(
        countries.map((c) => ({
          x: c.totalWealth,
          y: c.avgWealth,
          tag: c.country.tag,
          name: c.country.country.name,
          locationCount: c.locationCount,
          totalWealth: c.totalWealth,
          avgWealth: c.avgWealth,
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
      xAxis: logAxis(domain, "Total Wealth"),
      yAxis: {
        type: "value",
        ...yAxisName("Avg Wealth per Location"),
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
        min: 0,
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
            `Total Wealth: ${formatFloat(d.totalWealth, 2)}`,
            `Avg per Location: ${formatFloat(d.avgWealth, 2)}`,
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
      <LogFloorNote domain={domain} what="wealth" />
    </>
  );
}
