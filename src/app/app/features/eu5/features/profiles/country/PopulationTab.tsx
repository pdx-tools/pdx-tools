import { formatLongDate } from "@/features/timeline/date";
import { pointLabel, pointsToSave } from "../../../stack/yearlySeries";
import { useMemo } from "react";
import type { ConcentrationPoint, LocationRow, PopulationTypeProfileRow } from "@/wasm/wasm_eu5";
import { formatCount, formatExact, formatInt, formatPercent, formatRate } from "@/lib/format";
import { PopulationSankey, PopulationTypeProfile, popTypeLabel } from "../../insights/Population";
import { InsightReadout, ReadoutFigure } from "../../InsightReadout";
import { useEu5Trigger } from "../useEu5Trigger";
import { ConcentrationCurve, concentrationReading } from "../../insights/ConcentrationCurve";
import { Finding } from "../../../stack/parts";
import { levelBody } from "../../../stack/levelBody";
import { roundYearOffsets } from "../../insights/histogramAxis";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartGutter,
  chartTooltip,
  getEChartsTheme,
  neutralFill,
  neutralMark,
} from "@/components/viz/echartsTheme";
import { useEu5SaveDate } from "../../../store/eu5Store";
import { SectionTitle, Skeleton } from "../../../components";

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

function PopulationHistoryChart({ series, now }: { series: number[]; now: number }) {
  const saveDate = useEu5SaveDate();

  const data = useMemo(
    () => pointsToSave(series, saveDate, now).map(([x, y]) => [x - saveDate.year, y]),
    [series, saveDate, now],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    const baseYear = saveDate?.year ?? 0;
    const firstOffset = data.length > 0 ? (data[0] as number[])[0] : 0;
    const yearTicks = roundYearOffsets(firstOffset, baseYear);

    return {
      grid: { ...chartGutter, top: 12, bottom: 28 },
      xAxis: {
        type: "value",
        min: firstOffset,
        max: "dataMax",
        axisLabel: {
          color: tickColor,
          customValues: yearTicks,
          formatter: (value: number) => String(baseYear + value),
        },
        axisTick: { customValues: yearTicks },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const value = arr[0]?.value;
          if (!Array.isArray(value)) return "";
          const label = pointLabel(baseYear + Number(value[0]), formatLongDate(saveDate));
          const v = Number(value[1]);
          return `<strong>${label}</strong><br/>Population: ${formatExact(Math.round(v))}`;
        },
      },
      series: [
        {
          type: "line",
          data,
          symbol: "none",
          smooth: true,
          lineStyle: { color: neutralMark, width: 2 },
          areaStyle: { color: neutralFill },
        },
      ],
    };
  }, [data, saveDate]);

  if (series.length < 2) return null;

  return (
    <section>
      <SectionTitle>History</SectionTitle>
      <EChart option={option} style={{ height: "180px", width: "100%" }} />
    </section>
  );
}

/** Years that the growth figure looks back over */
const GROWTH_YEARS = 10;

/**
 * The yearly growth rate over the last years of the history. The history
 * has one sample for each year.
 */
function yearlyGrowth(series: number[]): number | null {
  const years = Math.min(GROWTH_YEARS, series.length - 1);
  if (years < 1) return null;
  const now = series[series.length - 1]!;
  const then = series[series.length - 1 - years]!;
  if (then <= 0 || now <= 0) return null;
  return Math.pow(now / then, 1 / years) - 1;
}

/** One line that names the largest pop type, and how much the top tenth of the locations holds */
function populationFinding(
  types: readonly PopulationTypeProfileRow[],
  topShare: number | undefined,
): string | null {
  const total = types.reduce((sum, row) => sum + row.population, 0);
  const largest = [...types].sort((a, b) => b.population - a.population)[0];
  if (!largest || total <= 0) return null;
  const lead = `${popTypeLabel(largest.populationType)} are ${formatPercent(largest.population / total)} of the people`;
  return topShare === undefined
    ? lead
    : `${lead}, and the top 10% of locations hold ${formatPercent(topShare)}`;
}

export function CountryPopulationTabContent({
  countryIdx,
  locations,
  historicalPopulation,
}: {
  countryIdx: number;
  locations: LocationRow[];
  historicalPopulation: number[];
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
  const showConcentration = locations.length >= 5 && concentration.length > 1;
  const showHistory = historicalPopulation.length >= 2;
  const total = locations.reduce((sum, location) => sum + location.population, 0);

  if (!data || total <= 0) {
    return (
      <p className="py-6 text-center text-sm text-game-ink-500">
        No population data across {formatInt(locations.length)} locations
      </p>
    );
  }

  const rankTotal = rankTotals.reduce((sum, rank) => sum + rank.population, 0);
  const urban = rankTotals
    .filter((rank) => rank.rank > 0)
    .reduce((sum, rank) => sum + rank.population, 0);
  const growth = yearlyGrowth(historicalPopulation);
  const finding = populationFinding(
    typeProfile,
    showConcentration ? concentrationReading(concentration)?.share : undefined,
  );

  return (
    <>
      {finding ? <Finding>{finding}</Finding> : null}
      <div className={`@container flex flex-col gap-4 ${levelBody}`}>
        <InsightReadout figure={formatCount(total)} unit="people">
          {growth != null ? <ReadoutFigure value={formatRate(growth)} label="a year" /> : null}
          {rankTotal > 0 ? (
            <ReadoutFigure value={formatPercent(urban / rankTotal)} label="urban" />
          ) : null}
          <ReadoutFigure value={formatInt(locations.length)} label="locations" />
        </InsightReadout>

        {showHistory && <PopulationHistoryChart series={historicalPopulation} now={total} />}

        <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-2">
          {hasTypeProfile && (
            <section>
              <SectionTitle>Pop types</SectionTitle>
              <PopulationTypeProfile rows={typeProfile} isEmpty />
            </section>
          )}

          {showConcentration && (
            <section>
              <SectionTitle>Concentration</SectionTitle>
              <ConcentrationCurve
                points={concentration}
                metric="population"
                showReading={!finding}
              />
            </section>
          )}
        </div>

        {(data.sankeyRows ?? []).length > 0 && (
          <section>
            <SectionTitle>Religion, pop type and culture</SectionTitle>
            <PopulationSankey rows={data.sankeyRows} />
          </section>
        )}
      </div>
    </>
  );
}
