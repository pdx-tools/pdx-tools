import ChevronRightIcon from "@heroicons/react/20/solid/ChevronRightIcon";
import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { GameButton } from "@/components/game/Button";
import type {
  CountryStateEfficacy,
  StateEfficacyScopeSummary,
  StateEfficacyTopLocation,
} from "@/wasm/wasm_eu5";
import {
  formatFloat,
  formatInt,
  formatMetric,
  formatPercent as formatShare,
  formatExactPercent,
  formatFixed,
  formatFixedPercent,
} from "@/lib/format";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, Eu5MapDataTable, SectionTitle } from "../../components";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartTooltip,
  getEChartsTheme,
  chartGutter,
  yAxisName,
} from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { useEu5Engine, useEu5Players } from "../../store";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";
import {
  InsightReadout,
  InsightReadoutSkeleton,
  ReadoutFigure,
  readoutAction,
} from "../InsightReadout";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useSelectedCountries } from "../../stack/selected";
import { countryDotSeries, logAxis, logDomain, LogFloorNote, scatterDots } from "./countryScatter";
import { useEu5EntityChartClick } from "./useEntityChartClick";

function StateEfficacyScopeHeader({ data }: { data?: StateEfficacyScopeSummary }) {
  const engine = useEu5Engine();
  if (!data) return <InsightReadoutSkeleton />;

  // Effective development is development discounted by control, so the
  // ledger says how much of the development survives the discount.
  return (
    <InsightReadout
      figure={formatMetric(data.totalEfficacy)}
      unit="effective development"
      action={
        <GameButton
          variant="ghost"
          className={readoutAction}
          onClick={() => engine.trigger.selectMapMode("development")}
        >
          Development
          <ChevronRightIcon aria-hidden className="h-3.5 w-3.5" />
        </GameButton>
      }
    >
      <ReadoutFigure
        value={formatShare(data.realizationRatio)}
        label={`of ${formatMetric(data.totalDevelopment)} development`}
      />
      <ReadoutFigure value={formatMetric(data.medianEfficacy)} label="median / location" />
    </InsightReadout>
  );
}

export function StateEfficacyInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.queries.getStateEfficacy());

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-3.5">
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
                title="Effective development"
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
  const selected = useSelectedCountries();
  const multiplayer = useEu5Players().length > 1;
  const domain = useMemo(() => logDomain(countries.map((c) => c.totalEfficacy)), [countries]);

  const scatterData = useMemo(
    () =>
      scatterDots(
        countries.map((c) => ({
          x: c.totalEfficacy,
          y: c.avgEfficacy,
          tag: c.country.tag,
          name: c.country.country.name,
          locationCount: c.locationCount,
          totalEfficacy: c.totalEfficacy,
          avgEfficacy: c.avgEfficacy,
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
      xAxis: logAxis(domain, "Total Effective Development"),
      yAxis: {
        type: "value",
        ...yAxisName("Avg Effective Development per Location"),
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
            `Total Effective Development: ${formatFloat(d.totalEfficacy, 1)}`,
            `Avg Effective Development per Location: ${formatFloat(d.avgEfficacy, 2)}`,
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
      <LogFloorNote domain={domain} what="effective development" />
    </>
  );
}

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
          return <LocationLink location={loc.location} />;
        },
      }),
      columnHelper.accessor("stateEfficacy", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Eff. Dev", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("development", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Dev", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("control", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({
          headerLabel: "Control",
          variant: "num",
          exact: formatExactPercent,
        }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixedPercent(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortFn: (a, b) =>
          a.original.owner.country.name.localeCompare(b.original.owner.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => <CountryLink country={row.original.owner} aligned />,
      }),
      columnHelper.accessor("population", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Pop", variant: "num" }),
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
      pagination
    />
  );
}
