import { useMemo } from "react";
import { createColumnHelper } from "@/lib/tanstack-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { Eu5DataTable, Eu5MapDataTable, SectionTitle } from "../../components";
import type {
  LocationPopRow,
  PopulationRankSegment,
  PopulationScopeSummary,
  PopulationTopLocation,
  PopulationTypeProfileRow,
  ScopedCountryPopulation,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { popRankColors } from "../../gameColors";
import {
  chartInk,
  chartTooltip,
  divergingPoles,
  getEChartsTheme,
  markGap,
  seriesColor,
} from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { ConcentrationCurve } from "./ConcentrationCurve";
import { PopulationReadout, PopulationReadoutSkeleton } from "./PopulationReadout";
import { MOST_POPULOUS_CAP } from "./populationConstants";
import { countryGrowthLines, formatPeople } from "./populationFormatting";

const BACK_LABEL = "Population";
// Settlement ranks keep the game's own colours: this is an ordered set, but
// player recognition outranks the ordinal ramp. See gameColors.ts.
const RANK_COLORS = popRankColors;
const RANK_LABELS = ["Rural", "Town", "City", "Megalopolis"] as const;

function formatPercent(value: number, digits = 1) {
  return `${formatFloat(value * 100, digits)}%`;
}

function PopulationScopeHeader({ data }: { data?: PopulationScopeSummary }) {
  if (!data) return <PopulationReadoutSkeleton />;
  return <PopulationReadout mode="population" figures={data} />;
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
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length > 0 && (
            <section>
              <SectionTitle>Population by country</SectionTitle>
              <CountryPopulationSpine countries={countries} />
            </section>
          )}

          {typeProfile.some(
            (r: PopulationTypeProfileRow) => r.population > 0 || r.baselinePopulation > 0,
          ) && (
            <section>
              <SectionTitle>
                {scopeIsEmpty ? "Population by pop type" : "Pop types vs world share"}
              </SectionTitle>
              <PopulationTypeProfile rows={typeProfile} isEmpty={scopeIsEmpty} />
            </section>
          )}

          {rankTotals.some((rank) => rank.population > 0) && (
            <section>
              <SectionTitle>Settlement mix</SectionTitle>
              <UrbanizationMix ranks={rankTotals} />
            </section>
          )}

          {concentration.length > 1 && (
            <section>
              <SectionTitle>Population concentration</SectionTitle>
              <ConcentrationCurve points={concentration} metric="population" />
            </section>
          )}

          {topLocations.length > 0 && (
            <section>
              <SectionTitle>Most populous locations</SectionTitle>
              <PopulationTopLocations locations={topLocations} />
            </section>
          )}

          {countries.length === 0 && (
            <Eu5InsightEmptyState title="No population data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}

type CountrySpineDatum = ScopedCountryPopulation & {
  name: string;
  id: number;
  anchorLocationIdx: number;
  rural: number;
  town: number;
  city: number;
  megalopolis: number;
};

function rankLabel(rank: number) {
  return RANK_LABELS[rank] ?? "Town";
}

function rankKey(rank: number): keyof typeof RANK_COLORS {
  return (["rural", "town", "city", "megalopolis"] as const)[rank] ?? "town";
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
    `<strong>${escapeEChartsHtml(country.country.country.name)}</strong>`,
    country.country.tag ? `Tag: ${escapeEChartsHtml(country.country.tag)}` : "",
    ...countryGrowthLines(country),
    ...ranks,
  ]
    .filter(Boolean)
    .join("<br/>");
}

function CountryPopulationSpine({ countries }: { countries: ScopedCountryPopulation[] }) {
  const rows = useMemo<CountrySpineDatum[]>(
    () =>
      countries.slice(0, MOST_POPULOUS_CAP).map((country) => ({
        ...country,
        name: country.country.country.name,
        id: country.country.country.key,
        anchorLocationIdx: country.country.anchorLocationIdx,
        rural: rankValue(country, 0),
        town: rankValue(country, 1),
        city: rankValue(country, 2),
        megalopolis: rankValue(country, 3),
      })),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      dataset: {
        source: rows,
        dimensions: ["name", "rural", "town", "city", "megalopolis"],
      },
      grid: { left: 110, right: 24, top: 10, bottom: 28 },
      xAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (value: number) => formatPeople(value),
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
          name: "Rural",
          type: "bar",
          stack: "population",
          encode: { x: "rural", y: "name" },
          itemStyle: { color: RANK_COLORS.rural, ...markGap },
        },
        {
          name: "Town",
          type: "bar",
          stack: "population",
          encode: { x: "town", y: "name" },
          itemStyle: { color: RANK_COLORS.town, ...markGap },
        },
        {
          name: "City",
          type: "bar",
          stack: "population",
          encode: { x: "city", y: "name" },
          itemStyle: { color: RANK_COLORS.city, ...markGap },
        },
        {
          name: "Megalopolis",
          type: "bar",
          stack: "population",
          encode: { x: "megalopolis", y: "name" },
          itemStyle: { color: RANK_COLORS.megalopolis, ...markGap },
        },
      ],
    };
  }, [rows]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    backLabel: "Population",
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

export function UrbanizationMix({ ranks }: { ranks: PopulationRankSegment[] }) {
  const row = useMemo(
    () => ({
      scope: "Scope",
      rural: ranks.find((rank) => rank.rank === 0)?.population ?? 0,
      town: ranks.find((rank) => rank.rank === 1)?.population ?? 0,
      city: ranks.find((rank) => rank.rank === 2)?.population ?? 0,
      megalopolis: ranks.find((rank) => rank.rank === 3)?.population ?? 0,
    }),
    [ranks],
  );

  const total = row.rural + row.town + row.city + row.megalopolis;

  const option = useMemo((): EChartsOption => {
    const { axisColor, tickColor } = getEChartsTheme();

    return {
      dataset: {
        source: [row],
        dimensions: ["scope", "rural", "town", "city", "megalopolis"],
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
        ...chartTooltip,
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
          itemStyle: { color: RANK_COLORS.rural, ...markGap },
        },
        {
          name: "Town",
          type: "bar",
          stack: "population",
          encode: { x: "town", y: "scope" },
          itemStyle: { color: RANK_COLORS.town, ...markGap },
        },
        {
          name: "City",
          type: "bar",
          stack: "population",
          encode: { x: "city", y: "scope" },
          itemStyle: { color: RANK_COLORS.city, ...markGap },
        },
        {
          name: "Megalopolis",
          type: "bar",
          stack: "population",
          encode: { x: "megalopolis", y: "scope" },
          itemStyle: { color: RANK_COLORS.megalopolis, ...markGap },
        },
      ],
    };
  }, [row, total]);

  return <EChart option={option} style={{ height: "86px", width: "100%" }} />;
}

const columnHelper = createColumnHelper<PopulationTopLocation>();

function PopulationTopLocations({ locations }: { locations: PopulationTopLocation[] }) {
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
        meta: Eu5DataTable.meta({ headerLabel: "Pop", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("rank", {
        sortFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Rank" }),
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
    [],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={locations}
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.location.key })}
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

export function PopulationTypeProfile({
  rows,
  isEmpty,
}: {
  rows: PopulationTypeProfileRow[];
  isEmpty: boolean;
}) {
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
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

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
          ...chartTooltip,
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
              `Population: ${formatPeople(d.population)}`,
              `Share: ${formatPercent(d.share)}`,
              `Avg Satisfaction: ${formatPercent(d.avgSatisfaction)}`,
              `Avg Literacy: ${formatPercent(d.avgLiteracy)}`,
            ].join("<br/>");
          },
        },
        series: [
          {
            type: "bar",
            encode: { x: "share", y: "label" },
            itemStyle: { color: seriesColor(0) },
          },
        ],
      };
    }

    return {
      dataset: { source: data, dimensions: ["label", "posBar", "negBar"] },
      grid: { left: 72, right: 16, top: 8, bottom: 48 },
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        textStyle: { color: tickColor, fontSize: 10 },
      },
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
        ...chartTooltip,
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
            `Selected pop: ${formatPeople(d.population)} (${formatPercent(d.share)})`,
            `World share: ${formatPercent(d.baselineShare)}`,
            `Difference: ${formatPercent(d.shareDelta, 1)}`,
            `Avg Satisfaction: ${formatPercent(d.avgSatisfaction)}`,
            `Avg Literacy: ${formatPercent(d.avgLiteracy)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          name: "Over",
          type: "bar",
          stack: "delta",
          encode: { x: "posBar", y: "label" },
          itemStyle: { color: divergingPoles.cool, ...markGap },
        },
        {
          name: "Under",
          type: "bar",
          stack: "delta",
          encode: { x: "negBar", y: "label" },
          itemStyle: { color: divergingPoles.warm, ...markGap },
        },
      ],
    };
  }, [data, isEmpty]);

  const height = data.length * 22 + 52;
  return <EChart option={option} style={{ height: `${height}px`, width: "100%" }} />;
}

const OTHER_COLOR = chartInk.muted;
const NO_CULTURE_LABEL = "No culture";

function getCultureName(row: LocationPopRow) {
  return row.culture?.name ?? NO_CULTURE_LABEL;
}

function buildSankeyOption(rows: LocationPopRow[]): EChartsOption {
  const totalSize = rows.reduce((s, r) => s + r.size, 0);
  if (totalSize === 0) return {};
  const threshold = totalSize * 0.02;

  const religionTotals = new Map<string, number>();
  const cultureTotals = new Map<string, number>();
  for (const row of rows) {
    const cultureName = getCultureName(row);
    religionTotals.set(row.religion.name, (religionTotals.get(row.religion.name) ?? 0) + row.size);
    cultureTotals.set(cultureName, (cultureTotals.get(cultureName) ?? 0) + row.size);
  }

  const remapped = rows.map((row) => {
    const cultureName = getCultureName(row);
    const cultureTotal = cultureTotals.get(cultureName) ?? 0;
    return {
      ...row,
      religionName:
        (religionTotals.get(row.religion.name) ?? 0) >= threshold ? row.religion.name : "Others",
      religionColorHex:
        (religionTotals.get(row.religion.name) ?? 0) >= threshold
          ? row.religionColorHex
          : OTHER_COLOR,
      cultureName: cultureTotal >= threshold ? cultureName : "Others",
      cultureColorHex: cultureTotal >= threshold ? row.cultureColorHex : OTHER_COLOR,
    };
  });

  const rId = (name: string) => `r:${name}`;
  const cId = (name: string) => `c:${name}`;

  const religionColorMap = new Map<string, string>();
  const cultureColorMap = new Map<string, string>();
  for (const row of remapped) {
    religionColorMap.set(rId(row.religionName), row.religionColorHex);
    cultureColorMap.set(cId(row.cultureName), row.cultureColorHex);
  }
  const kindNames = [...new Set(remapped.map((r) => r.kind))];

  const nodes = [
    ...[...religionColorMap.entries()].map(([id, color]) => ({
      name: id,
      itemStyle: { color },
    })),
    ...kindNames.map((name) => ({ name })),
    ...[...cultureColorMap.entries()].map(([id, color]) => ({
      name: id,
      itemStyle: { color },
    })),
  ];

  const religionKindMap = new Map<string, number>();
  const kindCultureMap = new Map<string, number>();
  for (const row of remapped) {
    const rkKey = `${rId(row.religionName)}||${row.kind}`;
    religionKindMap.set(rkKey, (religionKindMap.get(rkKey) ?? 0) + row.size);
    const kcKey = `${row.kind}||${cId(row.cultureName)}`;
    kindCultureMap.set(kcKey, (kindCultureMap.get(kcKey) ?? 0) + row.size);
  }

  const links = [
    ...[...religionKindMap.entries()].map(([key, value]) => {
      const [source, target] = key.split("||");
      return { source, target, value };
    }),
    ...[...kindCultureMap.entries()].map(([key, value]) => {
      const [source, target] = key.split("||");
      return { source, target, value };
    }),
  ];

  return {
    tooltip: {
      ...chartTooltip,
      trigger: "item",
      triggerOn: "mousemove",
      formatter: (params: unknown) => {
        const p = params as {
          name?: string;
          value?: number;
          data?: { source?: string; target?: string; value?: number };
        };
        const strip = (s?: string) => s?.replace(/^[rc]:/, "") ?? "";
        if (p.data?.source != null) {
          return `${strip(p.data.source)} → ${strip(p.data.target)}: ${formatInt(p.data.value ?? 0)}`;
        }
        return `${strip(p.name)}: ${formatInt(p.value ?? 0)}`;
      },
    },
    series: [
      {
        type: "sankey",
        emphasis: { focus: "adjacency" },
        nodeAlign: "left",
        label: {
          formatter: (params: unknown) => (params as { name: string }).name.replace(/^[rc]:/, ""),
          color: chartInk.primary,
          fontSize: 11,
          backgroundColor: chartTooltip.backgroundColor,
          padding: [2, 5],
          borderRadius: 3,
        },
        data: nodes,
        links,
      },
    ],
  };
}

export function PopulationSankey({ rows }: { rows: LocationPopRow[] }) {
  const option = useMemo(() => buildSankeyOption(rows), [rows]);
  if (rows.length === 0) return null;
  return <EChart option={option} style={{ height: "320px", width: "100%" }} />;
}
