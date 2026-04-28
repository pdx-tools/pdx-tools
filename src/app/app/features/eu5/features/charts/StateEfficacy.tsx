import { useCallback, useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type {
  CountryStateEfficacy,
  StateEfficacyScopeSummary,
  StateEfficacyTopLocation,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { useEu5Engine } from "../../store";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import {
  countryProfileEntry,
  locationProfileEntry,
  usePanelNav,
} from "../../EntityProfile/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../../EntityProfile/components/StatItem";
import type * as echarts from "echarts/core";

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
      {insightQuery.loading && !insightQuery.data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
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
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
      {children}
    </p>
  );
}

function StateEfficacyScatterChart({ countries }: { countries: CountryStateEfficacy[] }) {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  const isDark = isDarkMode();

  const topCountries = useMemo(
    () => new Set(countries.slice(0, 10).map((c) => c.tag)),
    [countries],
  );

  const scatterData = useMemo(
    () =>
      countries.map((c) => ({
        value: [c.totalEfficacy, c.avgEfficacy] as [number, number],
        tag: c.tag,
        name: c.name,
        locationCount: c.locationCount,
        totalEfficacy: c.totalEfficacy,
        avgEfficacy: c.avgEfficacy,
        totalPopulation: c.totalPopulation,
        color: c.colorHex,
        anchorLocationIdx: c.anchorLocationIdx,
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

  const handleInit = useCallback(
    (chart: echarts.ECharts) => {
      chart.on("click", (params) => {
        if (Array.isArray(params.data)) return;
        const d = params.data as (typeof scatterData)[number];
        const idx = d?.anchorLocationIdx;
        if (idx == null) return;
        if ((params.event?.event as MouseEvent)?.shiftKey) {
          void engine.trigger.addCountry(idx);
        } else if ((params.event?.event as MouseEvent)?.altKey) {
          void engine.trigger.removeCountry(idx);
        } else {
          void engine.trigger.selectCountry(idx);
          panToEntity(idx);
        }
      });
    },
    [engine, panToEntity],
  );

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
        header: ({ column }) => <Table.ColumnHeader column={column} title="Location" />,
        cell: ({ row }) => {
          const loc = row.original;
          return (
            <button
              type="button"
              className="text-left text-sky-300 hover:text-sky-200 hover:underline"
              onClick={() => {
                nav.pushMany([locationProfileEntry(loc.locationIdx, loc.name)], BACK_LABEL);
                panToEntity(loc.locationIdx);
              }}
            >
              {loc.name}
            </button>
          );
        },
      }),
      columnHelper.accessor("stateEfficacy", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="State Efficacy" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 1),
      }),
      columnHelper.accessor("development", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Development" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 1),
      }),
      columnHelper.accessor("control", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Control" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortingFn: (a, b) => a.original.owner.name.localeCompare(b.original.owner.name),
        header: ({ column }) => <Table.ColumnHeader column={column} title="Owner" />,
        cell: ({ row }) => {
          const owner = row.original.owner;
          return (
            <button
              type="button"
              className="inline-flex min-w-0 items-center gap-1.5 text-left text-sky-300 hover:text-sky-200 hover:underline"
              onClick={() => {
                nav.pushMany(
                  [countryProfileEntry(owner.anchorLocationIdx, owner.name)],
                  BACK_LABEL,
                );
                panToEntity(owner.anchorLocationIdx);
              }}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: owner.colorHex }}
              />
              {owner.tag && <span className="font-mono text-xs text-slate-500">{owner.tag}</span>}
              <span className="truncate">{owner.name}</span>
            </button>
          );
        },
      }),
      columnHelper.accessor("population", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Population" />,
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
    [nav, panToEntity],
  );

  return <DataTable className="w-full" columns={columns} data={locations} pagination={true} />;
}
