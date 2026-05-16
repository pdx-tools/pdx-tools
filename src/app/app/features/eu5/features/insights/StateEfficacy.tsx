import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type {
  CountryStateEfficacy,
  StateEfficacyScopeSummary,
  StateEfficacyTopLocation,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { locationProfileEntry, usePanelNav } from "../profiles/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { MapHoverButton } from "../../MapHoverButton";
import { EntityLink } from "../profiles/EntityLink";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../profiles/components/StatItem";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";

function StateEfficacyScopeHeader({ data }: { data?: StateEfficacyScopeSummary }) {
  if (!data) return <InsightScopeHeaderSkeleton />;

  return (
    <InsightScopeHeader>
      <StatItem
        label={data.isEmpty ? "Nations" : "Entities"}
        value={formatInt(data.countryCount)}
      />
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem label="Effective Dev" value={formatFloat(data.totalEfficacy, 1)} />
      <StatItem label="Avg Efficacy" value={formatFloat(data.avgEfficacy, 2)} />
      <StatItem label="Population" value={formatInt(data.totalPopulation)} />
    </InsightScopeHeader>
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
              <SectionTitle>Which powers realize the most territorial capacity?</SectionTitle>
              <StateEfficacyScatterChart countries={countries} />
            </section>
          )}

          {insightQuery.data?.distribution && (
            <section>
              <SectionTitle>
                How is effective development distributed across locations?
              </SectionTitle>
              <LocationDistributionChart distribution={insightQuery.data.distribution} />
            </section>
          )}

          {insightQuery.data && insightQuery.data.topLocations.length > 0 && (
            <section>
              <SectionTitle>What are the strongest effective locations?</SectionTitle>
              <StateEfficacyTopLocations locations={insightQuery.data.topLocations} />
            </section>
          )}

          {countries.length === 0 && !insightQuery.data?.distribution && (
            <Eu5InsightEmptyState title="No state efficacy data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
      {children}
    </p>
  );
}

function StateEfficacyScatterChart({ countries }: { countries: CountryStateEfficacy[] }) {
  const isDark = isDarkMode();

  const topCountries = useMemo(
    () => new Set(countries.slice(0, 10).map((c) => c.country.tag)),
    [countries],
  );

  const scatterData = useMemo(
    () =>
      countries.map((c) => ({
        value: [c.totalEfficacy, c.avgEfficacy] as [number, number],
        tag: c.country.tag,
        name: c.country.name,
        locationCount: c.locationCount,
        totalEfficacy: c.totalEfficacy,
        avgEfficacy: c.avgEfficacy,
        totalPopulation: c.totalPopulation,
        color: c.country.colorHex,
        id: c.country.countryIdx,
        anchorLocationIdx: c.country.anchorLocationIdx,
      })),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      grid: { left: 80, right: 60, top: 20, bottom: 60 },
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
        name: "Avg Efficacy per Location",
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
        { type: "slider", xAxisIndex: 0, bottom: 0, height: 20, textStyle: { color: tickColor } },
      ],
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as (typeof scatterData)[number];
          return [
            `<strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})`,
            `Total Efficacy: ${formatFloat(d.totalEfficacy, 1)}`,
            `Avg per Location: ${formatFloat(d.avgEfficacy, 2)}`,
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
              if (Array.isArray(params)) return isDark ? "#93c5fd" : "#3b82f6";
              const d = params.data as (typeof scatterData)[number];
              return d.color || (isDark ? "#93c5fd" : "#3b82f6");
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
            color: isDark ? "#e2e8f0" : "#1e293b",
            fontSize: 10,
            fontWeight: 600,
            distance: 4,
          },
        },
      ],
    };
  }, [scatterData, topCountries, isDark, countries.length]);

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

const BACK_LABEL = "State Efficacy";
const columnHelper = createColumnHelper<StateEfficacyTopLocation>();

function StateEfficacyTopLocations({ locations }: { locations: StateEfficacyTopLocation[] }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        sortingFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const loc = row.original;
          return (
            <MapHoverButton
              target={{ kind: "location", locationIdx: loc.locationIdx }}
              className="text-left text-game-accent-300 hover:text-game-accent-100 hover:underline"
              onClick={() => {
                nav.pushMany([locationProfileEntry(loc.locationIdx, loc.name)], BACK_LABEL);
                panToEntity(loc.locationIdx);
              }}
            >
              {loc.name}
            </MapHoverButton>
          );
        },
      }),
      columnHelper.accessor("stateEfficacy", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "State Efficacy", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("development", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Development", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("control", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Control", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortingFn: (a, b) => a.original.owner.name.localeCompare(b.original.owner.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => (
          <EntityLink entity={row.original.owner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      columnHelper.accessor("population", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Population", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [nav, panToEntity],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={locations}
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.locationIdx })}
      pagination
    />
  );
}
