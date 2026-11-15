import type { CountryWealth } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { formatExact } from "../../numberFormatting";
import { Figure } from "../../components/Figure";
import { escapeEChartsHtml } from "@/components/viz/EChart";
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
import { SectionTitle } from "../../components";
import { CountryScatter } from "./countryScatter";
import type { CountryPoint } from "./countryScatter";

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
    <InsightReadout figure={<Figure value={data.totalWealth} />} unit="total wealth">
      <ReadoutFigure value={<Figure value={data.medianWealth} />} label="median / location" />
      <ReadoutFigure
        value={<Figure value={data.topDecileShare} form="percent" />}
        label="in the top 10% of locations"
      />
    </InsightReadout>
  );
}

export function WealthInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.queries.getWealthInsight());

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
                formatValue={formatExact}
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

const wealthPoint = (c: CountryWealth): CountryPoint => ({
  country: c.country,
  x: c.totalWealth,
  y: c.avgWealth,
});

function wealthTooltip(c: CountryWealth): string {
  return [
    `<strong>${escapeEChartsHtml(c.country.country.name)}</strong> (${escapeEChartsHtml(c.country.tag)})`,
    `Total Wealth: ${formatExact(c.totalWealth)}`,
    `Avg per Location: ${formatExact(c.avgWealth)}`,
    `Locations: ${formatInt(c.locationCount)}`,
    `Population: ${formatInt(c.totalPopulation)}`,
  ].join("<br/>");
}

const FROM_ZERO = { min: 0 };

function WealthScatterChart({ countries }: { countries: CountryWealth[] }) {
  return (
    <CountryScatter
      rows={countries}
      point={wealthPoint}
      tooltip={wealthTooltip}
      xName="Total Wealth"
      yName="Avg Wealth per Location"
      yAxis={FROM_ZERO}
      floorWhat="wealth"
    />
  );
}
