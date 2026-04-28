import { useCallback, useMemo } from "react";
import type React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { DataTable } from "@/components/DataTable";
import { Table } from "@/components/Table";
import type {
  PopulationConcentrationPoint,
  PopulationRankSegment,
  PopulationScopeSummary,
  PopulationTopLocation,
  PopulationTypeProfileRow,
  ScopedCountryPopulation,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../../EntityProfile/components/StatItem";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { useEu5Engine } from "../../store";
import { usePanToEntity } from "../../usePanToEntity";
import {
  countryProfileEntry,
  locationProfileEntry,
  usePanelNav,
} from "../../EntityProfile/PanelNavContext";
import type * as echarts from "echarts/core";

const COUNTRY_CAP = 24;
const BACK_LABEL = "Population";
const RANK_COLORS = {
  rural: "#b85c5c",
  town: "#8b949e",
  city: "#d6a84f",
  metropolis: "#2aa6a1",
};
const RANK_LABELS = ["Rural", "Town", "City", "Metropolis"] as const;

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

function PopulationScopeHeader({ data }: { data?: PopulationScopeSummary }) {
  if (!data) return <InsightScopeHeaderSkeleton />;

  return (
    <InsightScopeHeader>
      <StatItem
        label={data.isEmpty ? "Countries" : "Entities"}
        value={formatInt(data.countryCount)}
      />
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem label="Population" value={formatInt(data.totalPopulation)} />
      <StatItem label="Median Loc" value={formatInt(data.medianLocationPopulation)} />
    </InsightScopeHeader>
  );
}

export function PopulationInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getPopulationInsight());

  const countries = insightQuery.data?.countries ?? [];
  const rankTotals = insightQuery.data?.rankTotals ?? [];
  const concentration = insightQuery.data?.concentration ?? [];
  const topLocations = insightQuery.data?.topLocations ?? [];
  const typeProfile = insightQuery.data?.typeProfile ?? [];
  const scopeIsEmpty = insightQuery.data?.scope.isEmpty ?? true;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PopulationScopeHeader data={insightQuery.data?.scope} />
      {insightQuery.loading && !insightQuery.data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          {countries.length > 0 && (
            <section>
              <SectionTitle>Who holds the selected population?</SectionTitle>
              <CountryPopulationSpine countries={countries} />
            </section>
          )}

          {typeProfile.some(
            (r: PopulationTypeProfileRow) => r.population > 0 || r.baselinePopulation > 0,
          ) && (
            <section>
              <SectionTitle>
                {scopeIsEmpty
                  ? "What is the population made of?"
                  : "What makes this selection unusual?"}
              </SectionTitle>
              <PopulationTypeProfile rows={typeProfile} isEmpty={scopeIsEmpty} />
            </section>
          )}

          {rankTotals.some((rank) => rank.population > 0) && (
            <section>
              <SectionTitle>What kind of settlements hold the population?</SectionTitle>
              <UrbanizationMix ranks={rankTotals} />
            </section>
          )}

          {concentration.length > 1 && (
            <section>
              <SectionTitle>How concentrated is the selected population?</SectionTitle>
              <PopulationConcentrationCurve points={concentration} />
            </section>
          )}

          {topLocations.length > 0 && (
            <section>
              <SectionTitle>What are the most populous locations?</SectionTitle>
              <PopulationTopLocations locations={topLocations} />
            </section>
          )}

          {countries.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              No population data in the selected scope
            </p>
          )}
        </>
      )}
    </div>
  );
}

type CountrySpineDatum = ScopedCountryPopulation & {
  rural: number;
  town: number;
  city: number;
  metropolis: number;
};

function rankLabel(rank: number) {
  return RANK_LABELS[rank] ?? "Town";
}

function rankKey(rank: number): keyof typeof RANK_COLORS {
  return (["rural", "town", "city", "metropolis"] as const)[rank] ?? "town";
}

function rankKeyFromLabel(label: string): keyof typeof RANK_COLORS {
  const idx = RANK_LABELS.findIndex((rank) => rank === label);
  return rankKey(idx);
}

function rankValue(country: ScopedCountryPopulation, rank: number) {
  return country.ranks.find((x) => x.rank === rank)?.population ?? 0;
}

function countryTooltip(country: ScopedCountryPopulation): string {
  const ranks = country.ranks
    .filter((rank) => rank.population > 0)
    .map(
      (rank) =>
        `${escapeEChartsHtml(rankLabel(rank.rank))}: ${formatInt(rank.population)} (${formatInt(
          rank.locationCount,
        )} locs)`,
    );

  return [
    `<strong>${escapeEChartsHtml(country.name)}</strong>`,
    country.tag ? `Tag: ${escapeEChartsHtml(country.tag)}` : "",
    `Population: ${formatInt(country.totalPopulation)}`,
    `Locations: ${formatInt(country.locationCount)}`,
    ...ranks,
  ]
    .filter(Boolean)
    .join("<br/>");
}

function CountryPopulationSpine({ countries }: { countries: ScopedCountryPopulation[] }) {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  const isDark = isDarkMode();

  const rows = useMemo<CountrySpineDatum[]>(
    () =>
      countries.slice(0, COUNTRY_CAP).map((country) => ({
        ...country,
        rural: rankValue(country, 0),
        town: rankValue(country, 1),
        city: rankValue(country, 2),
        metropolis: rankValue(country, 3),
      })),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      dataset: {
        source: rows,
        dimensions: ["name", "rural", "town", "city", "metropolis"],
      },
      grid: { left: 110, right: 24, top: 10, bottom: 28 },
      xAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (value: number) => formatInt(value),
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
          return row ? countryTooltip(row) : "";
        },
      },
      series: [
        {
          name: "Rural",
          type: "bar",
          stack: "population",
          encode: { x: "rural", y: "name" },
          itemStyle: { color: RANK_COLORS.rural },
        },
        {
          name: "Town",
          type: "bar",
          stack: "population",
          encode: { x: "town", y: "name" },
          itemStyle: { color: RANK_COLORS.town },
        },
        {
          name: "City",
          type: "bar",
          stack: "population",
          encode: { x: "city", y: "name" },
          itemStyle: { color: RANK_COLORS.city },
        },
        {
          name: "Metropolis",
          type: "bar",
          stack: "population",
          encode: { x: "metropolis", y: "name" },
          itemStyle: { color: RANK_COLORS.metropolis },
        },
      ],
    };
  }, [isDark, rows]);

  const handleInit = useCallback(
    (chart: echarts.ECharts) => {
      chart.on("click", (params) => {
        const idx = (params as { dataIndex?: number }).dataIndex;
        const country = idx == null ? undefined : rows[idx];
        if (!country) return;
        const event = params.event?.event as MouseEvent | undefined;
        if (event?.shiftKey) {
          void engine.trigger.addCountry(country.anchorLocationIdx);
        } else if (event?.altKey) {
          void engine.trigger.removeCountry(country.anchorLocationIdx);
        } else {
          void engine.trigger.selectCountry(country.anchorLocationIdx);
          panToEntity(country.anchorLocationIdx);
        }
      });
    },
    [engine, panToEntity, rows],
  );

  const height = rows.length * 24 + 54;
  return (
    <EChart option={option} style={{ height: `${height}px`, width: "100%" }} onInit={handleInit} />
  );
}

function UrbanizationMix({ ranks }: { ranks: PopulationRankSegment[] }) {
  const isDark = isDarkMode();

  const row = useMemo(
    () => ({
      scope: "Scope",
      rural: ranks.find((rank) => rank.rank === 0)?.population ?? 0,
      town: ranks.find((rank) => rank.rank === 1)?.population ?? 0,
      city: ranks.find((rank) => rank.rank === 2)?.population ?? 0,
      metropolis: ranks.find((rank) => rank.rank === 3)?.population ?? 0,
    }),
    [ranks],
  );

  const total = row.rural + row.town + row.city + row.metropolis;

  const option = useMemo((): EChartsOption => {
    const { axisColor, tickColor } = getEChartsTheme(isDark);

    return {
      dataset: {
        source: [row],
        dimensions: ["scope", "rural", "town", "city", "metropolis"],
      },
      grid: {
        left: 0,
        right: 0,
        top: 8,
        bottom: 18,
        outerBounds: { left: 0, right: 0, top: 0, bottom: 0 },
        outerBoundsContain: "axisLabel",
      },
      xAxis: {
        type: "value",
        max: total || 1,
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (value: number) => formatInt(value),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "category",
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          return arr
            .map((param) => {
              const name = String((param as { seriesName?: string }).seriesName ?? "");
              const value = row[rankKeyFromLabel(name)];
              return `${escapeEChartsHtml(name)}: ${formatInt(value)} (${formatPercent(total > 0 ? value / total : 0)})`;
            })
            .join("<br/>");
        },
      },
      series: [
        {
          name: "Rural",
          type: "bar",
          stack: "population",
          encode: { x: "rural", y: "scope" },
          itemStyle: { color: RANK_COLORS.rural },
        },
        {
          name: "Town",
          type: "bar",
          stack: "population",
          encode: { x: "town", y: "scope" },
          itemStyle: { color: RANK_COLORS.town },
        },
        {
          name: "City",
          type: "bar",
          stack: "population",
          encode: { x: "city", y: "scope" },
          itemStyle: { color: RANK_COLORS.city },
        },
        {
          name: "Metropolis",
          type: "bar",
          stack: "population",
          encode: { x: "metropolis", y: "scope" },
          itemStyle: { color: RANK_COLORS.metropolis },
        },
      ],
    };
  }, [isDark, row, total]);

  return <EChart option={option} style={{ height: "86px", width: "100%" }} />;
}

function PopulationConcentrationCurve({ points }: { points: PopulationConcentrationPoint[] }) {
  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      grid: {
        left: 48,
        right: 18,
        top: 10,
        bottom: 36,
        outerBounds: { left: 0, right: 0, top: 0, bottom: 0 },
        outerBoundsContain: "axisLabel",
      },
      xAxis: {
        type: "value",
        name: "Locations",
        min: 1,
        max: points.at(-1)?.locationRank ?? 1,
        nameTextStyle: { color: tickColor, fontSize: 10 },
        axisLabel: { color: tickColor, fontSize: 10 },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.4, width: 1 } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (value: number) => formatPercent(value, 0),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = (arr[0] as { dataIndex?: number } | undefined)?.dataIndex;
          if (idx == null) return "";
          const point = points[idx];
          if (!point) return "";
          return [
            `<strong>Top ${formatInt(point.locationRank)} locations</strong>`,
            `Account for <strong>${formatPercent(point.populationShare)}</strong> of total population`,
            `Total: ${formatInt(point.cumulativePopulation)}`,
            `Location population: ${formatInt(point.population)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "line",
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.16 },
          lineStyle: { width: 2, color: isDark ? "#f59e0b" : "#d97706" },
          itemStyle: { color: isDark ? "#f59e0b" : "#d97706" },
          data: points.map((point) => [point.locationRank, point.populationShare]),
        },
      ],
    };
  }, [isDark, points]);

  return <EChart option={option} style={{ height: "260px", width: "100%" }} />;
}

const columnHelper = createColumnHelper<PopulationTopLocation>();

function PopulationTopLocations({ locations }: { locations: PopulationTopLocation[] }) {
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
      columnHelper.accessor("population", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Pop" />,
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
      columnHelper.accessor("rank", {
        sortingFn: "text",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Rank" />,
        cell: (info) => {
          const rank = info.getValue();
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: RANK_COLORS[rankKey(rank)] }}
              />
              {rankLabel(rank)}
            </span>
          );
        },
      }),
    ],
    [nav, panToEntity],
  );

  return (
    <DataTable
      className="w-full"
      columns={columns}
      data={locations}
      initialSorting={[{ id: "population", desc: true }]}
      pagination
    />
  );
}

const POP_TYPE_LABELS = [
  "Peasants",
  "Laborers",
  "Burghers",
  "Nobles",
  "Clergy",
  "Soldiers",
  "Slaves",
  "Tribesmen",
] as const;

function popTypeLabel(id: number): string {
  return POP_TYPE_LABELS[id] ?? `Type ${id}`;
}

function PopulationTypeProfile({
  rows,
  isEmpty,
}: {
  rows: PopulationTypeProfileRow[];
  isEmpty: boolean;
}) {
  const isDark = isDarkMode();

  const data = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        label: popTypeLabel(r.populationType),
        posBar: Math.max(0, r.shareDelta),
        negBar: Math.min(0, r.shareDelta),
      })),
    [rows],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    if (isEmpty) {
      return {
        dataset: { source: data, dimensions: ["label", "share"] },
        grid: { left: 72, right: 16, top: 8, bottom: 28 },
        xAxis: {
          type: "value",
          min: 0,
          max: 1,
          axisLabel: {
            color: tickColor,
            fontSize: 10,
            formatter: (v: number) => formatPercent(v, 0),
          },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: {
            lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
          },
        },
        yAxis: {
          type: "category",
          inverse: true,
          axisLabel: { color: tickColor, fontSize: 11, fontWeight: 600, width: 66 },
          axisLine: { lineStyle: { color: axisColor } },
        },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) => {
            const arr = Array.isArray(params) ? params : [params];
            const idx = (arr[0] as { dataIndex?: number } | undefined)?.dataIndex;
            if (idx == null) return "";
            const d = data[idx];
            if (!d) return "";
            return [
              `<strong>${escapeEChartsHtml(d.label)}</strong>`,
              `Population: ${formatFloat(d.population, 0)}`,
              `Share: ${formatPercent(d.share)}`,
              `Avg Satisfaction: ${formatFloat(d.avgSatisfaction * 100, 1)}%`,
              `Avg Literacy: ${formatPercent(d.avgLiteracy)}`,
              `Pop records: ${formatInt(d.popCount)}`,
            ].join("<br/>");
          },
        },
        series: [
          {
            type: "bar",
            encode: { x: "share", y: "label" },
            itemStyle: { color: isDark ? "#f59e0b" : "#d97706" },
          },
        ],
      };
    }

    return {
      dataset: { source: data, dimensions: ["label", "posBar", "negBar"] },
      grid: { left: 72, right: 16, top: 8, bottom: 28 },
      xAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (v: number) => formatPercent(v, 1),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { color: tickColor, fontSize: 11, fontWeight: 600, width: 66 },
        axisLine: { lineStyle: { color: axisColor } },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = (arr[0] as { dataIndex?: number } | undefined)?.dataIndex;
          if (idx == null) return "";
          const d = data[idx];
          if (!d) return "";
          return [
            `<strong>${escapeEChartsHtml(d.label)}</strong>`,
            `Selected pop: ${formatFloat(d.population, 0)} (${formatPercent(d.share)})`,
            `World share: ${formatPercent(d.baselineShare)}`,
            `Difference: ${formatPercent(d.shareDelta, 1)}`,
            `Avg Satisfaction: ${formatFloat(d.avgSatisfaction * 100, 1)}%`,
            `Avg Literacy: ${formatPercent(d.avgLiteracy)}`,
            `Pop records: ${formatInt(d.popCount)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          name: "Over",
          type: "bar",
          stack: "delta",
          encode: { x: "posBar", y: "label" },
          itemStyle: { color: isDark ? "#f97316" : "#ea580c" },
        },
        {
          name: "Under",
          type: "bar",
          stack: "delta",
          encode: { x: "negBar", y: "label" },
          itemStyle: { color: isDark ? "#38bdf8" : "#0ea5e9" },
        },
      ],
    };
  }, [isDark, data, isEmpty]);

  const height = data.length * 22 + 52;
  return <EChart option={option} style={{ height: `${height}px`, width: "100%" }} />;
}
