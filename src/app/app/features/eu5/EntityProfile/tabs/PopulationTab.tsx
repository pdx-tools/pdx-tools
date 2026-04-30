import { useMemo } from "react";
import type React from "react";
import type { LocationRow, PopulationConcentrationPoint } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import {
  PopulationConcentrationCurve,
  PopulationTypeProfile,
  UrbanizationMix,
} from "../../features/charts/Population";
import { useEu5Trigger } from "../useEu5Trigger";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
      {children}
    </p>
  );
}

function concentrationFromLocations(locations: LocationRow[]): PopulationConcentrationPoint[] {
  const sorted = [...locations].sort(
    (a, b) => b.population - a.population || a.locationIdx - b.locationIdx,
  );
  const totalPopulation = sorted.reduce((sum, location) => sum + location.population, 0);
  let cumulativePopulation = 0;

  return sorted.map((location, idx) => {
    cumulativePopulation += location.population;
    return {
      locationRank: idx + 1,
      locationCount: sorted.length,
      population: location.population,
      cumulativePopulation,
      populationShare: totalPopulation > 0 ? cumulativePopulation / totalPopulation : 0,
    };
  });
}

export function CountryPopulationTabContent({
  anchorLocationIdx,
  locations,
}: {
  anchorLocationIdx: number;
  locations: LocationRow[];
}) {
  const { data, loading } = useEu5Trigger(
    (engine) => engine.trigger.getCountryPopulationProfile(anchorLocationIdx),
    [anchorLocationIdx],
  );
  const concentration = useMemo(() => concentrationFromLocations(locations), [locations]);

  if (loading && !data) {
    return <div className="h-64 animate-pulse rounded bg-white/5" />;
  }

  const typeProfile = data?.typeProfile ?? [];
  const rankTotals = data?.rankTotals ?? [];
  const hasTypeProfile = typeProfile.some((row) => row.population > 0);
  const hasRanks = rankTotals.some((rank) => rank.population > 0);
  const showConcentration = locations.length >= 5 && concentration.length > 1;

  if (!data || (!hasTypeProfile && !hasRanks && !showConcentration)) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        No population data across {formatInt(locations.length)} locations
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasTypeProfile && (
        <section>
          <SectionTitle>What is the population made of?</SectionTitle>
          <PopulationTypeProfile rows={typeProfile} isEmpty />
        </section>
      )}

      {hasRanks && (
        <section>
          <SectionTitle>What kind of settlements hold the population?</SectionTitle>
          <UrbanizationMix ranks={rankTotals} />
        </section>
      )}

      {showConcentration && (
        <section>
          <SectionTitle>How concentrated is the population?</SectionTitle>
          <PopulationConcentrationCurve points={concentration} />
        </section>
      )}
    </div>
  );
}
