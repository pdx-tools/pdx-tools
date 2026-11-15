import { GameButton } from "@/components/game/Button";
import type { CountryDevSummary, DevelopmentInsightData } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { formatExact } from "../../numberFormatting";
import { Figure } from "../../components/Figure";
import { escapeEChartsHtml } from "@/components/viz/EChart";
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
import { SectionTitle } from "../../components";
import { CountryScatter } from "./countryScatter";
import type { CountryPoint } from "./countryScatter";

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

const devPoint = (c: CountryDevSummary): CountryPoint => ({
  country: c.country,
  x: c.totalDevelopment,
  y: c.avgDevelopment,
});

function devTooltip(c: CountryDevSummary): string {
  return [
    `<strong>${escapeEChartsHtml(c.country.country.name)}</strong> (${escapeEChartsHtml(c.country.tag)})`,
    `Total Dev: ${formatExact(c.totalDevelopment)}`,
    `Avg per Location: ${formatExact(c.avgDevelopment)}`,
    `Locations: ${formatInt(c.locationCount)}`,
    `Population: ${formatInt(c.totalPopulation)}`,
  ].join("<br/>");
}

function DevelopmentScatterChart({ countries }: { countries: CountryDevSummary[] }) {
  return (
    <CountryScatter
      rows={countries}
      point={devPoint}
      tooltip={devTooltip}
      xName="Total Development"
      yName="Avg Dev per Location"
      zeroWhat="development"
    />
  );
}
