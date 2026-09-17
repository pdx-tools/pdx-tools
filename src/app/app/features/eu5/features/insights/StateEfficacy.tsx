import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { GameButton } from "@/components/game/Button";
import type {
  CountryStateEfficacy,
  StateEfficacyScopeSummary,
  StateEfficacyTopLocation,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, Eu5MapDataTable, SectionTitle } from "../../components";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartDataZoomSlider,
  chartInk,
  chartTooltip,
  getEChartsTheme,
  seriesColor,
} from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { useEu5Engine } from "../../store";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";

function StateEfficacyScopeHeader({ data }: { data?: StateEfficacyScopeSummary }) {
  const engine = useEu5Engine();
  if (!data) return <InsightReadoutSkeleton />;

  // Effective development is development discounted by control, so the
  // ledger says how much of the development survives the discount.
  return (
    <InsightReadout
      figure={formatInt(Math.round(data.totalEfficacy))}
      unit="effective development"
      action={
        <GameButton
          variant="ghost"
          className="-mr-3 shrink-0"
          onClick={() => engine.trigger.selectMapMode("development")}
        >
          Development
          <span aria-hidden="true">→</span>
        </GameButton>
      }
    >
      <ReadoutFigure
        value={`${formatFloat(data.realizationRatio * 100, 1)}%`}
        label={`of ${formatInt(Math.round(data.totalDevelopment))} development`}
      />
      <ReadoutFigure value={formatFloat(data.medianEfficacy, 1)} label="median / location" />
    </InsightReadout>
  );
}

export function StateEfficacyInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getStateEfficacy());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <StateEfficacyScopeHeader data={insightQuery.data?.scope} />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length >= 2 && (
            <section>
              <SectionTitle>Effective development by country</SectionTitle>
              <StateEfficacyScatterChart countries={countries} />
            </section>
          )}

          {insightQuery.data?.distribution && (
            <section>
              <LocationDistributionChart
                distribution={insightQuery.data.distribution}
                title="Effective development distribution"
              />
            </section>
          )}

          {insightQuery.data && insightQuery.data.topLocations.length > 0 && (
            <section>
              <SectionTitle>Top Effective Development Locations</SectionTitle>
              <StateEfficacyTopLocations locations={insightQuery.data.topLocations} />
            </section>
          )}

          {countries.length === 0 && !insightQuery.data?.distribution && (
            <Eu5InsightEmptyState title="No effective development data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}

function StateEfficacyScatterChart({ countries }: { countries: CountryStateEfficacy[] }) {
  const topCountries = useMemo(
    () => new Set(countries.slice(0, 10).map((c) => c.country.tag)),
    [countries],
  );

  const scatterData = useMemo(
    () =>
      countries.map((c) => ({
        value: [c.totalEfficacy, c.avgEfficacy] as [number, number],
        tag: c.country.tag,
        name: c.country.country.name,
        locationCount: c.locationCount,
        totalEfficacy: c.totalEfficacy,
        avgEfficacy: c.avgEfficacy,
        totalPopulation: c.totalPopulation,
        color: c.country.colorHex,
        id: c.country.country.key,
        anchorLocationIdx: c.country.anchorLocationIdx,
      })),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      grid: { left: 80, right: 60, top: 20, bottom: 76 },
      xAxis: {
        type: "value",
        name: "Total Effective Development",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
        min: 0,
      },
      yAxis: {
        type: "value",
        name: "Avg Effective Development per Location",
        nameLocation: "middle",
        nameGap: 60,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
        min: 0,
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, yAxisIndex: 0 },
        { ...chartDataZoomSlider, type: "slider", xAxisIndex: 0, bottom: 0, height: 20 },
      ],
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as (typeof scatterData)[number];
          return [
            `<strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})`,
            `Total Effective Development: ${formatFloat(d.totalEfficacy, 1)}`,
            `Avg Effective Development per Location: ${formatFloat(d.avgEfficacy, 2)}`,
            `Locations: ${formatInt(d.locationCount)}`,
            `Population: ${formatInt(d.totalPopulation)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 8,
          itemStyle: {
            color: (params) => {
              if (Array.isArray(params)) return seriesColor(0);
              const d = params.data as (typeof scatterData)[number];
              return d.color || seriesColor(0);
            },
            opacity: 0.8,
          },
          label: {
            show: true,
            formatter: (params) => {
              if (Array.isArray(params)) return "";
              const d = params.data as (typeof scatterData)[number];
              return topCountries.has(d.tag) || countries.length <= 5 ? d.tag : "";
            },
            position: "top",
            color: chartInk.primary,
            fontSize: 10,
            fontWeight: 600,
            distance: 4,
          },
        },
      ],
    };
  }, [scatterData, topCountries, countries.length]);

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

const BACK_LABEL = "Effective Development";
const columnHelper = createColumnHelper<StateEfficacyTopLocation>();

function StateEfficacyTopLocations({ locations }: { locations: StateEfficacyTopLocation[] }) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("location", {
        id: "location",
        sortFn: (a, b) => a.original.location.name.localeCompare(b.original.location.name),
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const loc = row.original;
          return <LocationLink location={loc.location} backLabel={BACK_LABEL} />;
        },
      }),
      columnHelper.accessor("stateEfficacy", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Effective Development", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("development", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Development", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("control", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Control", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
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
      pagination
    />
  );
}
