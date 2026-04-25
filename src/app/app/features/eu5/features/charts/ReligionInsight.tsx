import { useCallback, useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { DataTable } from "@/components/DataTable";
import { Table } from "@/components/Table";
import type { ReligionRow, StateReligionRow } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import type * as echarts from "echarts/core";

const STATE_RELIGION_CAP = 30;

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

export function ReligionInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getReligionInsight());

  const stateReligions = insightQuery.data?.stateReligions ?? [];
  const religions = insightQuery.data?.religions ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      {insightQuery.loading && !insightQuery.data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          {stateReligions.length > 0 && (
            <section>
              <SectionTitle>Which state religions rule the most population?</SectionTitle>
              <StateReligionChart stateReligions={stateReligions} />
            </section>
          )}

          {religions.length > 0 && (
            <section>
              <SectionTitle>Religions as States and Populations</SectionTitle>
              <ReligionTable religions={religions} />
            </section>
          )}

          {stateReligions.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              No religion data in the selected scope
            </p>
          )}
        </>
      )}
    </div>
  );
}

type FlatStateReligionDatum = {
  religion: string;
  colorHex: string;
  countryCount: number;
  totalRuledPopulation: number;
  stateReligionPopulation: number;
  otherFaithPopulation: number;
  stateReligionCoverage: number;
  topPopulationReligions: StateReligionRow["topPopulationReligions"];
};

function stateReligionTooltip(row: FlatStateReligionDatum): string {
  const topReligions = row.topPopulationReligions
    .map(
      (r) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${escapeEChartsHtml(r.colorHex)};margin-right:4px"></span>${escapeEChartsHtml(r.religion)}: ${formatInt(r.population)}`,
    )
    .join("<br/>");

  return [
    `<strong>${escapeEChartsHtml(row.religion)}</strong>`,
    `Countries: ${formatInt(row.countryCount)}`,
    `Total ruled population: ${formatInt(row.totalRuledPopulation)}`,
    `State-religion population: ${formatInt(row.stateReligionPopulation)}`,
    `Other-faith population: ${formatInt(row.otherFaithPopulation)}`,
    `State-religion coverage: ${formatPercent(row.stateReligionCoverage)}`,
    topReligions ? `<br/>Top population religions:<br/>${topReligions}` : "",
  ]
    .filter(Boolean)
    .join("<br/>");
}

function StateReligionChart({ stateReligions }: { stateReligions: StateReligionRow[] }) {
  const isDark = isDarkMode();

  const rows = useMemo<FlatStateReligionDatum[]>(
    () =>
      stateReligions.slice(0, STATE_RELIGION_CAP).map((r) => ({
        religion: r.religion,
        colorHex: r.colorHex,
        countryCount: r.countryCount,
        totalRuledPopulation: r.totalRuledPopulation,
        stateReligionPopulation: r.stateReligionPopulation,
        otherFaithPopulation: r.otherFaithPopulation,
        stateReligionCoverage: r.stateReligionCoverage,
        topPopulationReligions: r.topPopulationReligions,
      })),
    [stateReligions],
  );

  const flatSource = useMemo(
    () =>
      rows.map((r) => ({
        religion: r.religion,
        stateReligionPopulation: r.stateReligionPopulation,
        otherFaithPopulation: r.otherFaithPopulation,
      })),
    [rows],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      dataset: {
        source: flatSource,
        dimensions: ["religion", "stateReligionPopulation", "otherFaithPopulation"],
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
          return row ? stateReligionTooltip(row) : "";
        },
      },
      series: [
        {
          name: "State-religion population",
          type: "bar",
          stack: "population",
          encode: { x: "stateReligionPopulation", y: "religion" },
          itemStyle: {
            color: (params: { dataIndex: number }) => {
              return rows[params.dataIndex]?.colorHex ?? "#6366f1";
            },
          },
        },
        {
          name: "Other-faith population",
          type: "bar",
          stack: "population",
          encode: { x: "otherFaithPopulation", y: "religion" },
          itemStyle: { color: isDark ? "#334155" : "#cbd5e1" },
        },
      ],
    };
  }, [isDark, rows, flatSource]);

  const handleInit = useCallback((chart: echarts.ECharts) => {
    chart.on("click", () => {});
  }, []);

  const height = rows.length * 24 + 54;
  return (
    <EChart option={option} style={{ height: `${height}px`, width: "100%" }} onInit={handleInit} />
  );
}

const religionColumnHelper = createColumnHelper<ReligionRow>();

function CoverageBar({
  srPop,
  otherPop,
  colorHex,
}: {
  srPop: number;
  otherPop: number;
  colorHex: string;
}) {
  const total = srPop + otherPop;
  if (total === 0) return <span className="text-slate-600">—</span>;
  const srPct = srPop / total;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-2 w-24 overflow-hidden rounded-sm">
        <div style={{ width: `${srPct * 100}%`, backgroundColor: colorHex }} />
        <div className="flex-1 bg-slate-700" />
      </div>
      <span className="text-[11px] text-slate-400">{formatPercent(srPct)} state religion</span>
    </div>
  );
}

function ReligionTable({ religions }: { religions: ReligionRow[] }) {
  const columns = useMemo(
    () => [
      religionColumnHelper.accessor("religion", {
        sortingFn: "text",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Religion" />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: r.colorHex }}
              />
              <span className="truncate">{r.religion}</span>
            </span>
          );
        },
      }),
      religionColumnHelper.accessor("totalRuledPopulation", {
        id: "asStateReligion",
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="State Religion" />,
        cell: ({ row }) => {
          const r = row.original;
          if (r.stateCountryCount === 0) return <span className="text-slate-600">—</span>;
          return (
            <div className="flex flex-col">
              <span>
                {formatInt(r.stateCountryCount)}{" "}
                {r.stateCountryCount === 1 ? "country" : "countries"}
              </span>
              <span className="text-[11px] text-slate-400">
                {formatInt(r.totalRuledPopulation)} ruled population
              </span>
            </div>
          );
        },
      }),
      religionColumnHelper.accessor("stateReligionCoverage", {
        id: "ruledPopulation",
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Ruled Population" />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div
              title={`${formatInt(r.stateReligionPopulation)} follows state religion · ${formatInt(r.otherFaithPopulation)} other faiths`}
            >
              <CoverageBar
                srPop={r.stateReligionPopulation}
                otherPop={r.otherFaithPopulation}
                colorHex={r.colorHex}
              />
            </div>
          );
        },
      }),
      religionColumnHelper.accessor("followerPopulation", {
        id: "asPopulationReligion",
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Followers" />,
        cell: ({ row }) => {
          const r = row.original;
          if (r.followerPopulation === 0) return <span className="text-slate-600">—</span>;
          return (
            <div className="flex flex-col">
              <span>{formatInt(r.followerPopulation)}</span>
              <span className="text-[11px] text-slate-400">
                {formatInt(r.followersOutsideSameFaithStates)} outside same-faith states
              </span>
            </div>
          );
        },
      }),
    ],
    [],
  );

  return (
    <DataTable
      className="w-full"
      columns={columns}
      data={religions}
      initialSorting={[{ id: "asStateReligion", desc: true }]}
      pagination
    />
  );
}
