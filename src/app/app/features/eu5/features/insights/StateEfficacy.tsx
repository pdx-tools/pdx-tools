import { useMemo } from "react";
import { GameButton } from "@/components/game/Button";
import type {
  CountryStateEfficacy,
  StateEfficacyScopeSummary,
  StateEfficacyTopLocation,
} from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import {
  formatExact,
  formatExactPercent,
  formatFixed,
  formatPercent,
} from "../../numberFormatting";
import { Figure } from "../../components/Figure";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, Eu5MapDataTable, SectionTitle } from "../../components";
import { escapeEChartsHtml } from "@/components/viz/EChart";
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
import { CountryScatter } from "./countryScatter";
import type { CountryPoint } from "./countryScatter";

function StateEfficacyScopeHeader({ data }: { data?: StateEfficacyScopeSummary }) {
  const engine = useEu5Engine();
  if (!data) return <InsightReadoutSkeleton />;

  // Effective development is development discounted by control, so the
  // ledger says how much of the development survives the discount.
  return (
    <InsightReadout
      figure={<Figure value={data.totalEfficacy} />}
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
        value={<Figure value={data.realizationRatio} form="percent" />}
        label={
          <>
            of <Figure value={data.totalDevelopment} /> development
          </>
        }
      />
      <ReadoutFigure value={<Figure value={data.medianEfficacy} />} label="median / location" />
    </InsightReadout>
  );
}

export function StateEfficacyInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.queries.getStateEfficacy());

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
              <LocationDistributionChart distribution={insightQuery.data.distribution} />
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

const efficacyPoint = (c: CountryStateEfficacy): CountryPoint => ({
  country: c.country,
  x: c.totalEfficacy,
  y: c.avgEfficacy,
});

function efficacyTooltip(c: CountryStateEfficacy): string {
  return [
    `<strong>${escapeEChartsHtml(c.country.country.name)}</strong> (${escapeEChartsHtml(c.country.tag)})`,
    `Total Effective Development: ${formatExact(c.totalEfficacy)}`,
    `Avg Effective Development per Location: ${formatExact(c.avgEfficacy)}`,
    `Locations: ${formatInt(c.locationCount)}`,
    `Population: ${formatInt(c.totalPopulation)}`,
  ].join("<br/>");
}

const FROM_ZERO = { min: 0 };

function StateEfficacyScatterChart({ countries }: { countries: CountryStateEfficacy[] }) {
  return (
    <CountryScatter
      rows={countries}
      point={efficacyPoint}
      tooltip={efficacyTooltip}
      xName="Total Effective Development"
      yName="Avg Effective Development per Location"
      yAxis={FROM_ZERO}
      zeroWhat="effective development"
    />
  );
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
        meta: Eu5DataTable.meta({
          headerLabel: "Effective Development",
          variant: "num",
          term: "effectiveDevelopment",
        }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("development", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Development", variant: "num" }),
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
          <Eu5DataTable.NumericCell>{formatPercent(info.getValue())}</Eu5DataTable.NumericCell>
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
