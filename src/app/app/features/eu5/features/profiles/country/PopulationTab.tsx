import { useMemo } from "react";
import type { ConcentrationPoint, LocationRow, PopulationHistory } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import {
  PopulationSankey,
  PopulationTypeProfile,
  UrbanizationMix,
} from "../../insights/Population";
import { useEu5Trigger } from "../useEu5Trigger";
import { ConcentrationCurve } from "../../insights/ConcentrationCurve";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { chartTooltip, neutralFill, neutralMark, yAxisName } from "@/components/viz/echartsTheme";
import { useEu5SaveDate } from "../../../store/eu5Store";
import { SectionTitle, Skeleton } from "../../../components";
import { pointLabel, pointsToSave, yearAxis, yearOfDate } from "../../insights/yearlySeries";

function concentrationFromLocations(locations: LocationRow[]): ConcentrationPoint[] {
  const sorted = [...locations].sort(
    (a, b) => b.population - a.population || a.location.key - b.location.key,
  );
  const total = sorted.reduce((sum, location) => sum + location.population, 0);
  let cumulativeValue = 0;

  return sorted.map((location, idx) => {
    cumulativeValue += location.population;
    return {
      locationRank: idx + 1,
      locationCount: sorted.length,
      value: location.population,
      cumulativeValue,
      share: total > 0 ? cumulativeValue / total : 0,
    };
  });
}

function PopulationHistoryChart({ series, now }: { series: PopulationHistory; now: number }) {
  const saveDate = useEu5SaveDate();

  const data = useMemo(() => pointsToSave(series, saveDate, now), [series, saveDate, now]);

  const option = useMemo((): EChartsOption => {
    return {
      grid: { left: 60, right: 20, top: 32, bottom: 50 },
      xAxis: yearAxis(data[0]?.[0] ?? saveDate.year, yearOfDate(saveDate)),
      yAxis: {
        type: "value",
        ...yAxisName("Population"),
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const value = arr[0]?.value;
          if (!Array.isArray(value)) return "";
          const label = pointLabel(Number(value[0]), saveDate);
          return `<strong>${label}</strong><br/>Population: ${formatInt(Number(value[1]))}`;
        },
      },
      series: [
        {
          type: "line",
          data,
          symbol: "none",
          lineStyle: { color: neutralMark, width: 2 },
          areaStyle: { color: neutralFill },
        },
      ],
    };
  }, [data, saveDate]);

  if (series.people.length < 2) return null;

  return (
    <section>
      <SectionTitle>How has population changed over time?</SectionTitle>
      <EChart option={option} style={{ height: "200px", width: "100%" }} />
    </section>
  );
}

export function CountryPopulationTabContent({
  countryIdx,
  locations,
  totalPopulation,
  historicalPopulation,
}: {
  countryIdx: number;
  locations: LocationRow[];
  totalPopulation: number;
  historicalPopulation: PopulationHistory;
}) {
  const { data, loading } = useEu5Trigger(
    (engine) => engine.queries.getCountryPopulationProfile(countryIdx),
    [countryIdx],
  );
  const concentration = useMemo(() => concentrationFromLocations(locations), [locations]);

  if (loading && !data) {
    return <Skeleton className="h-64" />;
  }

  const typeProfile = data?.typeProfile ?? [];
  const rankTotals = data?.rankTotals ?? [];
  const hasTypeProfile = typeProfile.some((row) => row.population > 0);
  const hasRanks = rankTotals.some((rank) => rank.population > 0);
  const showConcentration = locations.length >= 5 && concentration.length > 1;
  const showHistory = historicalPopulation.people.length >= 2;

  if (!data || (!hasTypeProfile && !hasRanks && !showConcentration && !showHistory)) {
    return (
      <p className="py-6 text-center text-sm text-game-ink-500">
        No population data across {formatInt(locations.length)} locations
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {showHistory && (
        <PopulationHistoryChart series={historicalPopulation} now={totalPopulation} />
      )}

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
          <ConcentrationCurve points={concentration} metric="population" />
        </section>
      )}

      {(data?.sankeyRows ?? []).length > 0 && (
        <section>
          <SectionTitle>How does religion and culture shape the population?</SectionTitle>
          <PopulationSankey rows={data!.sankeyRows} />
        </section>
      )}
    </div>
  );
}
