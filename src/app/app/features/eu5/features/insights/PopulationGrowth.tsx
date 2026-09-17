import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type {
  CountryPopulationGrowth,
  PopulationGrowthScopeSummary,
  PopulationGrowthTopLocation,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, Eu5MapDataTable, SectionTitle } from "../../components";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartInk,
  chartTooltip,
  getEChartsTheme,
  seriesColor,
} from "@/components/viz/echartsTheme";
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
import { PopulationReadout, PopulationReadoutSkeleton } from "./PopulationReadout";
import { PopulationHistoryChart } from "./PopulationHistoryChart";
import { MOST_POPULOUS_CAP } from "./populationConstants";
import { countryGrowthLines, formatRate } from "./populationFormatting";

const BACK_LABEL = "Population Growth";
// Scatter labels: the powers that add the most people, and the fastest
// growers among countries at least as populous as the scope's median.
const SCATTER_LABEL_CAP = 8;
const SCATTER_FAST_LABEL_CAP = 6;

/** Ticks on a log axis land on powers of ten, so no decimals. */
function formatLogTick(value: number): string {
  if (value >= 1_000_000) return `${formatInt(value / 1_000_000)}M`;
  if (value >= 1_000) return `${formatInt(value / 1_000)}K`;
  return formatInt(value);
}

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
    engine.trigger.getPopulationGrowthInsight(),
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
                title="Growth rate (%/yr) across locations"
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
              backLabel={BACK_LABEL}
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
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      dataset: { source: rows, dimensions: ["name", "ratePercent"] },
      grid: { left: 110, right: 24, top: 22, bottom: 28 },
      xAxis: {
        type: "value",
        min: 0,
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (value: number) => `${formatFloat(value, 1)}%`,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { color: tickColor, fontSize: 11, fontWeight: 600, width: 100 },
        axisLine: { lineStyle: { color: axisColor } },
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
          itemStyle: { color: seriesColor(0) },
          markLine: {
            symbol: "none",
            silent: true,
            animation: false,
            data: [{ xAxis: scopeRate * 100 }],
            lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
            label: {
              color: tickColor,
              fontSize: 10,
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
    backLabel: BACK_LABEL,
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
    <EChart option={option} style={{ height: `${height}px`, width: "100%" }} onInit={handleInit} />
  );
}

function GrowthScaleScatter({
  countries,
  scopeRate,
  scopeLabel,
}: {
  countries: CountryPopulationGrowth[];
  scopeRate: number;
  scopeLabel: string;
}) {
  const labelSet = useMemo(() => {
    if (countries.length <= 10) return new Set(countries.map((c) => c.country.tag));
    // `countries` arrives sorted by births per year.
    const most = countries.slice(0, SCATTER_LABEL_CAP).map((c) => c.country.tag);
    const populations = countries.map((c) => c.totalPopulation).sort((a, b) => a - b);
    const median = populations[Math.floor(populations.length / 2)] ?? 0;
    const fastest = countries
      .filter((c) => c.totalPopulation >= median)
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, SCATTER_FAST_LABEL_CAP)
      .map((c) => c.country.tag);
    return new Set([...most, ...fastest]);
  }, [countries]);

  // Only the labelled powers can be told apart by colour, so the rest keep
  // their game colour but fade into a density field, drawn first so the
  // labelled marks sit on top.
  const scatterData = useMemo(
    () =>
      countries
        .map((c) => {
          const labelled = labelSet.has(c.country.tag);
          return {
            value: [c.totalPopulation, c.growthRate * 100] as [number, number],
            tag: c.country.tag,
            name: c.country.country.name,
            id: c.country.country.key,
            anchorLocationIdx: c.country.anchorLocationIdx,
            country: c,
            labelled,
            itemStyle: {
              color: c.country.colorHex || seriesColor(0),
              opacity: labelled ? 0.95 : 0.35,
            },
          };
        })
        .sort((a, b) => Number(a.labelled) - Number(b.labelled)),
    [countries, labelSet],
  );

  const maxBirths = useMemo(
    () => Math.max(...countries.map((c) => c.birthsPerYear), 1),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      grid: { left: 64, right: 60, top: 20, bottom: 52 },
      xAxis: {
        type: "log",
        name: "Population",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          hideOverlap: true,
          formatter: formatLogTick,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      yAxis: {
        type: "value",
        name: "Growth / yr",
        nameLocation: "middle",
        nameGap: 46,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor, formatter: (v: number) => `${formatFloat(v, 1)}%` },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
        min: 0,
      },
      dataZoom: [{ type: "inside", xAxisIndex: 0, yAxisIndex: 0 }],
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as (typeof scatterData)[number];
          return countryTooltip(d.country);
        },
      },
      series: [
        {
          type: "scatter",
          data: scatterData,
          // Area encodes births per year, so the radius grows with the root.
          symbolSize: (_value: unknown, params: unknown) => {
            const d = (params as { data: (typeof scatterData)[number] }).data;
            return 4 + Math.sqrt(d.country.birthsPerYear / maxBirths) * 26;
          },
          color: seriesColor(0),
          label: {
            show: true,
            formatter: (params) => {
              if (Array.isArray(params)) return "";
              const d = params.data as (typeof scatterData)[number];
              return labelSet.has(d.tag) ? d.tag : "";
            },
            position: "top",
            color: chartInk.primary,
            fontSize: 10,
            fontWeight: 600,
            distance: 4,
          },
          labelLayout: { hideOverlap: true },
          markLine: {
            symbol: "none",
            silent: true,
            animation: false,
            data: [{ yAxis: scopeRate * 100 }],
            lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
            label: {
              color: tickColor,
              fontSize: 10,
              position: "insideStartTop",
              formatter: `${scopeLabel} ${formatRate(scopeRate)}`,
            },
          },
        },
      ],
    };
  }, [scatterData, labelSet, maxBirths, scopeRate, scopeLabel]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    backLabel: BACK_LABEL,
    getTarget: (params) => {
      if (Array.isArray(params.data)) return null;
      const country = params.data as (typeof scatterData)[number] | undefined;
      return country
        ? { id: country.id, anchorLocationIdx: country.anchorLocationIdx, label: country.name }
        : null;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
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
        meta: Eu5DataTable.meta({ headerLabel: "Births / yr", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>
            {formatInt(Math.round(info.getValue()))}
          </Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("growthRate", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Growth / yr", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatRate(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("population", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Population", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
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
