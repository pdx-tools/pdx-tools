import { useMemo } from "react";
import type React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { DataTable } from "@/components/DataTable";
import { Table } from "@/components/Table";
import type {
  ControlScopeSummary,
  ControlTopLocation,
  CountryControlBarSummary,
  CountryControlPoint,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../../EntityProfile/components/StatItem";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { usePanToEntity } from "../../usePanToEntity";
import {
  countryProfileEntry,
  locationProfileEntry,
  usePanelNav,
} from "../../EntityProfile/PanelNavContext";
import { useEu5EntityChartClick } from "./useEntityChartClick";

const SCATTER_LABEL_CAP = 8;
const BACK_LABEL = "Control";

const CONTROL_BANDS = [
  { id: "superficial", label: "<25%", color: "#ef4444" },
  { id: "functional", label: "25-50%", color: "#f97316" },
  { id: "effective", label: "50-75%", color: "#f59e0b" },
  { id: "great", label: "75-90%", color: "#14b8a6" },
  { id: "perfect", label: "90-100%", color: "#64748b" },
] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
      {children}
    </p>
  );
}

function formatPercent(value: number, digits = 1) {
  return `${formatFloat(value * 100, digits)}%`;
}

function ControlScopeHeader({ data }: { data?: ControlScopeSummary }) {
  if (!data) return <InsightScopeHeaderSkeleton />;

  return (
    <InsightScopeHeader>
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem
        label={data.isEmpty ? "Countries" : "Entities"}
        value={formatInt(data.countryCount)}
      />
      <StatItem label="Avg Control" value={formatPercent(data.weightedAvgControl)} />
      <StatItem label="Lost Dev" value={formatFloat(data.lostDevelopment, 1)} />
    </InsightScopeHeader>
  );
}

export function ControlInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getControlInsight());

  const data = insightQuery.data;
  const barCountries = data?.barCountries ?? [];
  const scatterCountries = data?.scatterCountries ?? [];
  const topLocations = data?.topLocations ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <ControlScopeHeader data={data?.scope} />
      {insightQuery.loading && !data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          {barCountries.length > 0 && (
            <section>
              <SectionTitle>Where is control costing the most development?</SectionTitle>
              <ControlLossBars countries={barCountries} />
            </section>
          )}

          {scatterCountries.length >= 2 && (
            <section>
              <SectionTitle>Which powers combine scale with weak control?</SectionTitle>
              <ControlScaleScatter countries={scatterCountries} />
            </section>
          )}

          {topLocations.length > 0 && (
            <section>
              <SectionTitle>Which locations deserve attention first?</SectionTitle>
              <ControlTopLocations locations={topLocations} />
            </section>
          )}

          {barCountries.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              No control loss data in the selected scope
            </p>
          )}
        </>
      )}
    </div>
  );
}

type BarRow = {
  name: string;
  tag: string;
  weightedAvgControl: number;
  totalDevelopment: number;
  effectiveDevelopment: number;
  lostDevelopment: number;
  locationCount: number;
};

function countryBarTooltip(country: BarRow): string {
  return [
    `<strong>${escapeEChartsHtml(country.name)}</strong> (${escapeEChartsHtml(country.tag)})`,
    `Avg Control: ${formatPercent(country.weightedAvgControl)}`,
    `Total Dev: ${formatFloat(country.totalDevelopment, 1)}`,
    `Effective Dev: ${formatFloat(country.effectiveDevelopment, 1)}`,
    `Lost Dev: ${formatFloat(country.lostDevelopment, 1)}`,
    `Locations: ${formatInt(country.locationCount)}`,
  ]
    .filter(Boolean)
    .join("<br/>");
}

function ControlLossBars({ countries }: { countries: CountryControlBarSummary[] }) {
  const isDark = isDarkMode();

  const rows = useMemo(
    () =>
      countries.map((c) => {
        const bandMap: Record<string, number> = {};
        for (const seg of c.bands) {
          bandMap[seg.band] = seg.lostDevelopment;
        }
        return {
          anchorLocationIdx: c.anchorLocationIdx,
          name: c.name,
          tag: c.tag,
          weightedAvgControl: c.weightedAvgControl,
          totalDevelopment: c.totalDevelopment,
          effectiveDevelopment: c.effectiveDevelopment,
          lostDevelopment: c.lostDevelopment,
          locationCount: c.locationCount,
          superficial: bandMap["superficial"] ?? 0,
          functional: bandMap["functional"] ?? 0,
          effective: bandMap["effective"] ?? 0,
          great: bandMap["great"] ?? 0,
        };
      }),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      dataset: {
        source: rows,
        dimensions: ["name", "superficial", "functional", "effective", "great"],
      },
      legend: {
        bottom: 0,
        textStyle: { color: tickColor, fontSize: 10 },
        data: [
          { name: "Superficial (<25%)", itemStyle: { color: CONTROL_BANDS[0].color } },
          { name: "Functional (25-50%)", itemStyle: { color: CONTROL_BANDS[1].color } },
          { name: "Effective (50-75%)", itemStyle: { color: CONTROL_BANDS[2].color } },
          { name: "Great (75-90%)", itemStyle: { color: CONTROL_BANDS[3].color } },
        ],
      },
      grid: { left: 110, right: 24, top: 10, bottom: 48 },
      xAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (value: number) => formatFloat(value, 0),
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
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = (arr[0] as { dataIndex?: number } | undefined)?.dataIndex;
          if (idx == null) return "";
          const row = rows[idx];
          return row ? countryBarTooltip(row) : "";
        },
      },
      series: [
        {
          name: "Superficial (<25%)",
          type: "bar",
          stack: "loss",
          encode: { x: "superficial", y: "name" },
          itemStyle: { color: CONTROL_BANDS[0].color },
        },
        {
          name: "Functional (25-50%)",
          type: "bar",
          stack: "loss",
          encode: { x: "functional", y: "name" },
          itemStyle: { color: CONTROL_BANDS[1].color },
        },
        {
          name: "Effective (50-75%)",
          type: "bar",
          stack: "loss",
          encode: { x: "effective", y: "name" },
          itemStyle: { color: CONTROL_BANDS[2].color },
        },
        {
          name: "Great (75-90%)",
          type: "bar",
          stack: "loss",
          encode: { x: "great", y: "name" },
          itemStyle: { color: CONTROL_BANDS[3].color },
        },
      ],
    };
  }, [isDark, rows]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getAnchorLocationIdx: (params) =>
      (params.data as (typeof rows)[number] | undefined)?.anchorLocationIdx,
  });

  const height = rows.length * 24 + 54;
  return (
    <EChart option={option} style={{ height: `${height}px`, width: "100%" }} onInit={handleInit} />
  );
}

function ControlScaleScatter({ countries }: { countries: CountryControlPoint[] }) {
  const isDark = isDarkMode();

  const labelSet = useMemo(() => {
    if (countries.length <= 10) return new Set(countries.map((c) => c.tag));
    const sorted = [...countries].sort((a, b) => b.lostDevelopment - a.lostDevelopment);
    return new Set(sorted.slice(0, SCATTER_LABEL_CAP).map((c) => c.tag));
  }, [countries]);

  const scatterData = useMemo(
    () =>
      countries.map((c) => ({
        value: [c.totalDevelopment, c.weightedAvgControl] as [number, number],
        tag: c.tag,
        name: c.name,
        lostDevelopment: c.lostDevelopment,
        totalDevelopment: c.totalDevelopment,
        weightedAvgControl: c.weightedAvgControl,
        locationCount: c.locationCount,
        colorHex: c.colorHex,
        anchorLocationIdx: c.anchorLocationIdx,
      })),
    [countries],
  );

  const maxLost = useMemo(
    () => Math.max(...countries.map((c) => c.lostDevelopment), 1),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      grid: { left: 80, right: 60, top: 20, bottom: 60 },
      xAxis: {
        type: "value",
        name: "Total Development",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor, formatter: (v: number) => formatFloat(v, 0) },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
        min: 0,
      },
      yAxis: {
        type: "value",
        name: "Avg Control",
        nameLocation: "middle",
        nameGap: 60,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          formatter: (v: number) => formatPercent(v, 0),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
        min: 0,
        max: 1,
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
            `Avg Control: ${formatPercent(d.weightedAvgControl)}`,
            `Total Dev: ${formatFloat(d.totalDevelopment, 1)}`,
            `Lost Dev: ${formatFloat(d.lostDevelopment, 1)}`,
            `Locations: ${formatInt(d.locationCount)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "scatter",
          data: scatterData,
          symbolSize: (_value: unknown, params: unknown) => {
            const d = (params as { data: (typeof scatterData)[number] }).data;
            const pct = d.lostDevelopment / maxLost;
            return 6 + pct * 24;
          },
          itemStyle: {
            color: (params) => {
              if (Array.isArray(params)) return isDark ? "#93c5fd" : "#3b82f6";
              const d = params.data as (typeof scatterData)[number];
              return d.colorHex || (isDark ? "#93c5fd" : "#3b82f6");
            },
            opacity: 0.8,
          },
          label: {
            show: true,
            formatter: (params) => {
              if (Array.isArray(params)) return "";
              const d = params.data as (typeof scatterData)[number];
              return labelSet.has(d.tag) ? d.tag : "";
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
  }, [scatterData, labelSet, maxLost, isDark]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getAnchorLocationIdx: (params) => {
      if (Array.isArray(params.data)) return null;
      return (params.data as (typeof scatterData)[number])?.anchorLocationIdx;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}

const columnHelper = createColumnHelper<ControlTopLocation>();

function ControlTopLocations({ locations }: { locations: ControlTopLocation[] }) {
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
      columnHelper.accessor("control", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Control" />,
        meta: { className: "text-right" },
        cell: (info) => formatPercent(info.getValue()),
      }),
      columnHelper.accessor("development", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Development" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 1),
      }),
      columnHelper.accessor("lostDevelopment", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Lost Dev" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 1),
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

  return (
    <DataTable
      className="w-full"
      columns={columns}
      data={locations}
      initialSorting={[{ id: "lostDevelopment", desc: true }]}
      pagination
    />
  );
}
