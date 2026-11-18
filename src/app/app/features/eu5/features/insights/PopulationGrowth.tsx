import { useCallback, useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type {
  CountryPopulationGrowth,
  PopulationGrowthScopeSummary,
  PopulationGrowthTopLocation,
} from "@/wasm/wasm_eu5";
import {
  formatExactCount,
  formatFixed,
  formatPercentTick,
  formatRate,
} from "../../numberFormatting";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, Eu5MapDataTable, SectionTitle } from "../../components";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { chartInk, chartText, chartTooltip, neutralMark } from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { CountryScatter } from "./countryScatter";
import type { CountryPoint, SeriesOption } from "./countryScatter";
import { PopulationReadout, PopulationReadoutSkeleton } from "./PopulationReadout";
import { PopulationHistoryChart } from "./PopulationHistoryChart";
import { MOST_POPULOUS_CAP } from "./populationConstants";
import { countryGrowthLines } from "./populationFormatting";

const BACK_LABEL = "Population Growth";

function countryTooltip(c: CountryPopulationGrowth): string {
  return [
    `<strong>${escapeEChartsHtml(c.country.country.name)}</strong> (${escapeEChartsHtml(c.country.tag)})`,
    ...countryGrowthLines(c),
  ].join("<br/>");
}

function PopulationGrowthScopeHeader({ data }: { data?: PopulationGrowthScopeSummary }) {
  if (!data) return <PopulationReadoutSkeleton />;
  return <PopulationReadout mode="populationGrowth" figures={data} />;
}

export function PopulationGrowthInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) =>
    engine.queries.getPopulationGrowthInsight(),
  );

  const data = insightQuery.data;
  const countries = data?.countries ?? [];
  const topLocations = data?.topLocations ?? [];
  const scopeRate = data?.scope.growthRate ?? 0;
  // The dashed reference line on both charts: the growth of everything in
  // scope, weighted by population.
  const scopeLabel = data?.scope.isEmpty === false ? "Selection avg" : "World avg";

  return (
    <div className="flex flex-col gap-4 p-4">
      <PopulationGrowthScopeHeader data={data?.scope} />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length > 0 && (
            <section>
              <SectionTitle>Population growth rates</SectionTitle>
              <GrowthRateBars countries={countries} scopeRate={scopeRate} scopeLabel={scopeLabel} />
            </section>
          )}

          {countries.length >= 2 && (
            <section>
              <SectionTitle>Growth rate vs population</SectionTitle>
              <GrowthScaleScatter
                countries={countries}
                scopeRate={scopeRate}
                scopeLabel={scopeLabel}
              />
            </section>
          )}

          {data?.distribution && (
            <section>
              <LocationDistributionChart
                distribution={data.distribution}
                title="Locations by growth rate (%/yr)"
              />
            </section>
          )}

          {topLocations.length > 0 && (
            <section>
              <SectionTitle>Locations adding the most people</SectionTitle>
              <PopulationGrowthTopLocations locations={topLocations} />
            </section>
          )}

          {countries.length > 0 && (
            <PopulationHistoryChart
              countries={countries}
              scopeIsEmpty={data?.scope.isEmpty ?? true}
            />
          )}

          {countries.length === 0 && (
            <Eu5InsightEmptyState title="No population growth data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}

type RateRow = CountryPopulationGrowth & {
  name: string;
  id: number;
  anchorLocationIdx: number;
  ratePercent: number;
};

function GrowthRateBars({
  countries,
  scopeRate,
  scopeLabel,
}: {
  countries: CountryPopulationGrowth[];
  scopeRate: number;
  scopeLabel: string;
}) {
  // Same powers as the Population insight's country chart, so a reader can
  // move between the two panels and see the same names.
  const rows = useMemo<RateRow[]>(
    () =>
      [...countries]
        .sort((a, b) => b.totalPopulation - a.totalPopulation)
        .slice(0, MOST_POPULOUS_CAP)
        .sort((a, b) => b.growthRate - a.growthRate)
        .map((c) => ({
          ...c,
          name: c.country.country.name,
          id: c.country.country.key,
          anchorLocationIdx: c.country.anchorLocationIdx,
          ratePercent: c.growthRate * 100,
        })),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    return {
      dataset: { source: rows, dimensions: ["name", "ratePercent"] },
      grid: { left: 110, right: 24, top: 22, bottom: 28 },
      xAxis: {
        type: "value",
        min: 0,
        axisLabel: { formatter: (value: number) => formatPercentTick(value / 100) },
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { width: 100 },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = (arr[0] as { dataIndex?: number } | undefined)?.dataIndex;
          if (idx == null) return "";
          const row = rows[idx];
          return row ? countryTooltip(row) : "";
        },
      },
      series: [
        {
          type: "bar",
          encode: { x: "ratePercent", y: "name" },
          itemStyle: { color: neutralMark },
          // A thin bar, so that a long list of a bright neutral is not a block.
          barMaxWidth: 10,
          markLine: {
            symbol: "none",
            silent: true,
            animation: false,
            data: [{ xAxis: scopeRate * 100 }],
            // A bright line, so that it shows over the grey bars.
            lineStyle: { type: "dashed", color: chartInk.secondary, width: 1 },
            label: {
              ...chartText,
              position: "start",
              formatter: `${scopeLabel} ${formatRate(scopeRate)}`,
            },
          },
        },
      ],
    };
  }, [rows, scopeRate, scopeLabel]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getTarget: (params) => {
      const idx = params.dataIndex;
      const country = idx == null ? null : rows[idx];
      return country
        ? { id: country.id, anchorLocationIdx: country.anchorLocationIdx, label: country.name }
        : null;
    },
  });

  const height = rows.length * 24 + 54;
  return (
    <EChart
      gpuBars
      mergeUpdates
      option={option}
      style={{ height: `${height}px`, width: "100%" }}
      onInit={handleInit}
    />
  );
}

const GROWTH_SCALE = { formatter: formatPercentTick };

function GrowthScaleScatter({
  countries,
  scopeRate,
  scopeLabel,
}: {
  countries: CountryPopulationGrowth[];
  scopeRate: number;
  scopeLabel: string;
}) {
  // The area of a dot shows the births per year.
  const point = useMemo(() => {
    const maxBirths = Math.max(...countries.map((c) => c.birthsPerYear), 1);
    return (c: CountryPopulationGrowth): CountryPoint => ({
      country: c.country,
      x: c.totalPopulation,
      y: c.growthRate,
      symbolSize: 4 + Math.sqrt(c.birthsPerYear / maxBirths) * 26,
    });
  }, [countries]);

  const under = useCallback(
    (): SeriesOption[] => [
      {
        type: "line",
        data: [],
        silent: true,
        markLine: {
          symbol: "none",
          silent: true,
          animation: false,
          // The rate is a ratio, so it needs more than the 2 decimals of the default.
          precision: 6,
          data: [{ yAxis: scopeRate }],
          lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
          // The note under the chart gives the value. A label on the line
          // can be under the names of the dots.
          label: { show: false },
        },
      },
    ],
    [scopeRate],
  );

  return (
    <>
      <CountryScatter
        rows={countries}
        point={point}
        tooltip={countryTooltip}
        xName="Population"
        yName="Growth / yr"
        yAxis={GROWTH_SCALE}
        under={under}
        legend="Dot area: births per year."
      />
      <p className="mt-1 text-[12px] text-game-ink-500">
        Dashed line: {scopeLabel} {formatRate(scopeRate)}
      </p>
    </>
  );
}

const columnHelper = createColumnHelper<PopulationGrowthTopLocation>();

function PopulationGrowthTopLocations({ locations }: { locations: PopulationGrowthTopLocation[] }) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("location", {
        id: "location",
        sortFn: (a, b) => a.original.location.name.localeCompare(b.original.location.name),
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => <LocationLink location={row.original.location} backLabel={BACK_LABEL} />,
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortFn: (a, b) =>
          a.original.owner.country.name.localeCompare(b.original.owner.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.owner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      columnHelper.accessor("birthsPerYear", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({
          headerLabel: "Births / yr",
          variant: "num",
          exact: formatExactCount,
        }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("growthRate", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({
          headerLabel: "Growth / yr",
          variant: "num",
          // The rate already shows all the digits that a full value has.
          exact: () => undefined,
        }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatRate(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("population", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Population", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={locations}
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.location.key })}
      initialSorting={[{ id: "birthsPerYear", desc: true }]}
      pagination
    />
  );
}
