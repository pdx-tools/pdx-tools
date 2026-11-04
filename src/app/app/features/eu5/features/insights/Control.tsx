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
import {
  formatFloat,
  formatInt,
  formatMetric,
  formatPercent as formatShare,
  formatExactPercent,
  formatFixed,
  formatFixedPercent,
} from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartTooltip,
  getEChartsTheme,
  markGap,
  ordinalRamp,
  chartGutter,
  yAxisName,
} from "@/components/viz/echartsTheme";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import { useEu5Players } from "../../store";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useSelectedCountries } from "../../stack/selected";
import { countryDotSeries, logAxis, logDomain, LogFloorNote, scatterDots } from "./countryScatter";
import { useEu5EntityChartClick } from "./useEntityChartClick";

// The chart omits the engine's `perfect` band, so use four steps for four bars.
const BAND_COLORS = ordinalRamp(4);
const CONTROL_BANDS = [
  { id: "superficial", label: "<25%", color: BAND_COLORS[0]! },
  { id: "functional", label: "25-50%", color: BAND_COLORS[1]! },
  { id: "effective", label: "50-75%", color: BAND_COLORS[2]! },
  { id: "great", label: "75-90%", color: BAND_COLORS[3]! },
] as const;

function formatPercent(value: number, digits = 1) {
  return `${formatFloat(value * 100, digits)}%`;
}

function ControlScopeHeader({ data }: { data?: ControlScopeSummary }) {
  if (!data) return <InsightReadoutSkeleton />;

  // Control is a ratio, so it leads; the ledger says what it costs and how
  // much development sits in the weakly held bands.
  return (
    <InsightReadout figure={formatShare(data.weightedAvgControl)} unit="control">
      <ReadoutFigure value={formatMetric(data.lostDevelopment)} label="development lost" />
      <ReadoutFigure
        value={formatShare(data.weakControlDevelopmentShare)}
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
    <div className="flex flex-col gap-4 p-3.5">
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
    `Total Dev: ${formatFloat(country.totalDevelopment, 1)}`,
    `Effective Dev: ${formatFloat(country.effectiveDevelopment, 1)}`,
    `Lost Dev: ${formatFloat(country.lostDevelopment, 1)}`,
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
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      dataset: {
        source: rows,
        dimensions: ["name", "superficial", "functional", "effective", "great"],
      },
      legend: {
        bottom: 0,
        textStyle: { color: tickColor, fontSize: 12 },
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
          fontSize: 12,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { color: tickColor, fontSize: 12, width: 100 },
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

function ControlScaleScatter({ countries }: { countries: CountryControlPoint[] }) {
  const selected = useSelectedCountries();
  const multiplayer = useEu5Players().length > 1;
  const domain = useMemo(() => logDomain(countries.map((c) => c.totalDevelopment)), [countries]);

  const scatterData = useMemo(
    () =>
      scatterDots(
        countries.map((c) => ({
          x: c.totalDevelopment,
          y: c.weightedAvgControl,
          tag: c.country.tag,
          name: c.country.country.name,
          lostDevelopment: c.lostDevelopment,
          totalDevelopment: c.totalDevelopment,
          weightedAvgControl: c.weightedAvgControl,
          locationCount: c.locationCount,
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

  const maxLost = useMemo(
    () => Math.max(...countries.map((c) => c.lostDevelopment), 1),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

    return {
      grid: { ...chartGutter, top: 28, bottom: 52 },
      xAxis: logAxis(domain, "Total Development"),
      yAxis: {
        type: "value",
        ...yAxisName("Avg Control"),
        axisLabel: {
          color: tickColor,
          formatter: (v: number) => formatPercent(v, 0),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
        min: 0,
        max: 1,
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
            `Avg Control: ${formatPercent(d.weightedAvgControl)}`,
            `Total Dev: ${formatFloat(d.totalDevelopment, 1)}`,
            `Lost Dev: ${formatFloat(d.lostDevelopment, 1)}`,
            `Locations: ${formatInt(d.locationCount)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          ...countryDotSeries(),
          data: scatterData,
          symbolSize: (_value: unknown, params: unknown) => {
            const d = (params as { data: (typeof scatterData)[number] }).data;
            const pct = d.lostDevelopment / maxLost;
            return 6 + pct * 24;
          },
        },
      ],
    };
  }, [scatterData, domain, maxLost]);

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
      <LogFloorNote domain={domain} what="development" />
    </>
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
          return <LocationLink location={loc.location} />;
        },
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortFn: (a, b) =>
          a.original.owner.country.name.localeCompare(b.original.owner.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => <CountryLink country={row.original.owner} aligned />,
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
      columnHelper.accessor("development", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Dev", variant: "num" }),
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
      initialSorting={[{ id: "lostDevelopment", desc: true }]}
      pagination
    />
  );
}
