import { useMemo } from "react";
import type React from "react";
import type { LocationRow, PopulationConcentrationPoint } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import {
  PopulationConcentrationCurve,
  PopulationSankey,
  PopulationTypeProfile,
  UrbanizationMix,
} from "../../insights/Population";
import { useEu5Trigger } from "../useEu5Trigger";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { useEu5SaveDate } from "../../../store/eu5Store";

function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    const v = value / 1_000_000;
    return `${v % 1 === 0 ? formatInt(v) : v.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const v = value / 1_000;
    return `${v % 1 === 0 ? formatInt(v) : v.toFixed(1)}K`;
  }
  return formatInt(Math.round(value));
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
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

function PopulationHistoryChart({ series }: { series: number[] }) {
  const isDark = isDarkMode();
  const saveDate = useEu5SaveDate();

  const data = useMemo(
    () => series.map((value, index) => [index - series.length + 1, value * 1000]),
    [series],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    const baseYear = saveDate?.year ?? 0;

    return {
      grid: { left: 60, right: 20, top: 16, bottom: 50 },
      xAxis: {
        type: "value",
        min: data.length > 0 ? (data[0] as number[])[0] : 0,
        max: 0,
        nameLocation: "middle",
        nameGap: 34,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          formatter: (value: number) => String(baseYear + value),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
      },
      yAxis: {
        type: "value",
        name: "Population",
        nameLocation: "middle",
        nameGap: 46,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          formatter: formatCompact,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const value = arr[0]?.value;
          if (!Array.isArray(value)) return "";
          const year = baseYear + Number(value[0]);
          const v = Number(value[1]);
          return `<strong>${year}</strong><br/>Population: ${formatCompact(v)}`;
        },
      },
      series: [
        {
          type: "line",
          data,
          symbol: "none",
          smooth: true,
          lineStyle: { color: isDark ? "#4ade80" : "#16a34a", width: 2 },
          areaStyle: { color: isDark ? "rgba(74,222,128,0.12)" : "rgba(22,163,74,0.14)" },
        },
      ],
    };
  }, [data, isDark, saveDate]);

  if (series.length < 2) return null;

  return (
    <section>
      <SectionTitle>How has population changed over time?</SectionTitle>
      <EChart option={option} style={{ height: "200px", width: "100%" }} />
    </section>
  );
}

export function CountryPopulationTabContent({
  anchorLocationIdx,
  locations,
  historicalPopulation,
}: {
  anchorLocationIdx: number;
  locations: LocationRow[];
  historicalPopulation: number[];
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
  const showHistory = historicalPopulation.length >= 2;

  if (!data || (!hasTypeProfile && !hasRanks && !showConcentration && !showHistory)) {
    return (
      <p className="py-6 text-center text-sm text-game-ink-500">
        No population data across {formatInt(locations.length)} locations
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {showHistory && <PopulationHistoryChart series={historicalPopulation} />}

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

      {(data?.sankeyRows ?? []).length > 0 && (
        <section>
          <SectionTitle>How does religion and culture shape the population?</SectionTitle>
          <PopulationSankey rows={data!.sankeyRows} />
        </section>
      )}
    </div>
  );
}
