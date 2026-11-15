import { useMemo } from "react";
import { createColumnHelper } from "@/lib/tanstack-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { Eu5DataTable, Eu5MapDataTable, SectionTitle } from "../../components";
import type {
  ControlScopeSummary,
  ControlTopLocation,
  CountryControlBarSummary,
  CountryControlPoint,
} from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import {
  formatExact,
  formatExactPercent,
  formatFixed,
  formatPercent,
  formatPercentTick,
} from "../../numberFormatting";
import { Figure } from "../../components/Figure";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { chartTooltip, markGap, ordinalRamp } from "@/components/viz/echartsTheme";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { CountryScatter } from "./countryScatter";
import type { CountryPoint } from "./countryScatter";

const BACK_LABEL = "Control";

// The chart omits the engine's `perfect` band, so use four steps for four bars.
const BAND_COLORS = ordinalRamp(4);
const CONTROL_BANDS = [
  { id: "superficial", label: "<25%", color: BAND_COLORS[0]! },
  { id: "functional", label: "25-50%", color: BAND_COLORS[1]! },
  { id: "effective", label: "50-75%", color: BAND_COLORS[2]! },
  { id: "great", label: "75-90%", color: BAND_COLORS[3]! },
] as const;

function ControlScopeHeader({ data }: { data?: ControlScopeSummary }) {
  if (!data) return <InsightReadoutSkeleton />;

  // Control is a ratio, so it leads; the ledger says what it costs and how
  // much development sits in the weakly held bands.
  return (
    <InsightReadout
      figure={<Figure value={data.weightedAvgControl} form="percent" />}
      unit="control"
    >
      <ReadoutFigure value={<Figure value={data.lostDevelopment} />} label="development lost" />
      <ReadoutFigure
        value={<Figure value={data.weakControlDevelopmentShare} form="percent" />}
        label="of development under 50% control"
      />
    </InsightReadout>
  );
}

export function ControlInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.queries.getControlInsight());

  const data = insightQuery.data;
  const barCountries = data?.barCountries ?? [];
  const scatterCountries = data?.scatterCountries ?? [];
  const topLocations = data?.topLocations ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <ControlScopeHeader data={data?.scope} />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {barCountries.length > 0 && (
            <section>
              <SectionTitle>Development lost by country</SectionTitle>
              <ControlLossBars countries={barCountries} />
            </section>
          )}

          {scatterCountries.length >= 2 && (
            <section>
              <SectionTitle>Control vs development by country</SectionTitle>
              <ControlScaleScatter countries={scatterCountries} />
            </section>
          )}

          {topLocations.length > 0 && (
            <section>
              <SectionTitle>Top development-loss locations</SectionTitle>
              <ControlTopLocations locations={topLocations} />
            </section>
          )}

          {barCountries.length === 0 && (
            <Eu5InsightEmptyState title="No control loss data in the selected scope." />
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
    `Total Dev: ${formatExact(country.totalDevelopment)}`,
    `Effective Dev: ${formatExact(country.effectiveDevelopment)}`,
    `Lost Dev: ${formatExact(country.lostDevelopment)}`,
    `Locations: ${formatInt(country.locationCount)}`,
  ]
    .filter(Boolean)
    .join("<br/>");
}

function ControlLossBars({ countries }: { countries: CountryControlBarSummary[] }) {
  const rows = useMemo(
    () =>
      countries.map((c) => {
        const bandMap: Record<string, number> = {};
        for (const seg of c.bands) {
          bandMap[seg.band] = seg.lostDevelopment;
        }
        return {
          id: c.country.country.key,
          anchorLocationIdx: c.country.anchorLocationIdx,
          name: c.country.country.name,
          tag: c.country.tag,
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
    return {
      dataset: {
        source: rows,
        dimensions: ["name", "superficial", "functional", "effective", "great"],
      },
      legend: {
        bottom: 0,
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
          return row ? countryBarTooltip(row) : "";
        },
      },
      series: [
        {
          name: "Superficial (<25%)",
          type: "bar",
          stack: "loss",
          encode: { x: "superficial", y: "name" },
          itemStyle: { color: CONTROL_BANDS[0].color, ...markGap },
        },
        {
          name: "Functional (25-50%)",
          type: "bar",
          stack: "loss",
          encode: { x: "functional", y: "name" },
          itemStyle: { color: CONTROL_BANDS[1].color, ...markGap },
        },
        {
          name: "Effective (50-75%)",
          type: "bar",
          stack: "loss",
          encode: { x: "effective", y: "name" },
          itemStyle: { color: CONTROL_BANDS[2].color, ...markGap },
        },
        {
          name: "Great (75-90%)",
          type: "bar",
          stack: "loss",
          encode: { x: "great", y: "name" },
          itemStyle: { color: CONTROL_BANDS[3].color, ...markGap },
        },
      ],
    };
  }, [rows]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getTarget: (params) => {
      const country = params.data as (typeof rows)[number] | undefined;
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

function controlTooltip(c: CountryControlPoint): string {
  return [
    `<strong>${escapeEChartsHtml(c.country.country.name)}</strong> (${escapeEChartsHtml(c.country.tag)})`,
    `Avg Control: ${formatPercent(c.weightedAvgControl)}`,
    `Total Dev: ${formatExact(c.totalDevelopment)}`,
    `Lost Dev: ${formatExact(c.lostDevelopment)}`,
    `Locations: ${formatInt(c.locationCount)}`,
  ].join("<br/>");
}

const CONTROL_SCALE = { min: 0, max: 1, formatter: formatPercentTick };

function ControlScaleScatter({ countries }: { countries: CountryControlPoint[] }) {
  // The size of a dot shows the development that the country loses.
  const point = useMemo(() => {
    const maxLost = Math.max(...countries.map((c) => c.lostDevelopment), 1);
    return (c: CountryControlPoint): CountryPoint => ({
      country: c.country,
      x: c.totalDevelopment,
      y: c.weightedAvgControl,
      symbolSize: 6 + (c.lostDevelopment / maxLost) * 24,
    });
  }, [countries]);

  return (
    <CountryScatter
      rows={countries}
      point={point}
      tooltip={controlTooltip}
      xName="Total Development"
      yName="Avg Control"
      yAxis={CONTROL_SCALE}
      zeroWhat="development"
    />
  );
}

const columnHelper = createColumnHelper<ControlTopLocation>();

function ControlTopLocations({ locations }: { locations: ControlTopLocation[] }) {
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
      columnHelper.accessor("development", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Development", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("lostDevelopment", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Lost Dev", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
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
      initialSorting={[{ id: "lostDevelopment", desc: true }]}
      pagination
    />
  );
}
