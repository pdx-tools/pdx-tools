import { useMemo } from "react";
import type React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { DataTable } from "@/components/DataTable";
import { Table } from "@/components/Table";
import type {
  RgoInsightData,
  RgoMaterialProfileDelta,
  RgoMaterialSummary,
  RgoScopeSummary,
  RgoTopLocation,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../../EntityProfile/components/StatItem";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { usePanToEntity } from "../../usePanToEntity";
import { usePanelNav } from "../../EntityProfile/PanelNavContext";

const BACK_LABEL = "RGO";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
      {children}
    </p>
  );
}

function formatLevel(value: number) {
  return formatFloat(value, 1);
}

function formatPercent(value: number) {
  return `${formatFloat(value * 100, 1)}%`;
}

function RgoScopeHeader({ data }: { data?: RgoScopeSummary }) {
  if (!data) return <InsightScopeHeaderSkeleton />;

  return (
    <InsightScopeHeader>
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem label="RGO Levels" value={formatInt(data.totalRgoLevel)} />
      <StatItem label="Avg RGO" value={formatLevel(data.avgRgoLevel)} />
    </InsightScopeHeader>
  );
}

function RawMaterialScatter({ materials }: { materials: RgoMaterialSummary[] }) {
  const isDark = isDarkMode();

  const scatterData = useMemo(
    () =>
      materials.map((m) => ({
        ...m,
        value: [m.totalRgoLevel, m.avgRgoLevel],
      })),
    [materials],
  );

  const maxLocCount = useMemo(
    () => Math.max(...materials.map((m) => m.locationCount), 1),
    [materials],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor, labelColor } = getEChartsTheme(isDark);

    return {
      grid: { left: 60, right: 24, top: 24, bottom: 60 },
      xAxis: {
        type: "value",
        name: "Total RGO Level",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: labelColor, fontSize: 10, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (v: number) => formatLevel(v),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      yAxis: {
        type: "value",
        name: "Avg RGO Level",
        nameLocation: "middle",
        nameGap: 44,
        nameTextStyle: { color: labelColor, fontSize: 10, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (v: number) => formatLevel(v),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = scatterData[params.dataIndex];
          if (!d) return "";
          return [
            `<strong>${escapeEChartsHtml(d.rawMaterial)}</strong>`,
            `Total RGO: ${formatLevel(d.totalRgoLevel)}`,
            `Avg RGO: ${formatLevel(d.avgRgoLevel)}`,
            `Median RGO: ${formatLevel(d.medianRgoLevel)}`,
            `Locations: ${formatInt(d.locationCount)}`,
            `Selection share: ${formatPercent(d.scopedShare)}`,
            `Global share: ${formatPercent(d.globalShare)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "scatter",
          data: scatterData.map((d) => d.value),
          symbolSize: (_val, params) => {
            const d = scatterData[params.dataIndex];
            if (!d) return 6;
            const scaled = Math.sqrt((d.locationCount / maxLocCount) * 900) + 4;
            return Math.max(4, Math.min(40, scaled));
          },
          itemStyle: { color: isDark ? "#60a5fa" : "#2563eb", opacity: 0.75 },
        },
      ],
    };
  }, [isDark, scatterData, maxLocCount]);

  return <EChart option={option} style={{ height: "320px", width: "100%" }} />;
}

function RawMaterialProfileDeltaChart({ deltas }: { deltas: RgoMaterialProfileDelta[] }) {
  const isDark = isDarkMode();

  const data = useMemo(
    () =>
      deltas.map((d) => ({
        ...d,
        posBar: Math.max(0, d.shareDelta),
        negBar: Math.min(0, d.shareDelta),
      })),
    [deltas],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      dataset: { source: data, dimensions: ["rawMaterial", "posBar", "negBar"] },
      grid: { left: 100, right: 24, top: 8, bottom: 28 },
      xAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (v: number) => formatPercent(v),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { color: tickColor, fontSize: 10, fontWeight: 600, width: 92 },
        axisLine: { lineStyle: { color: axisColor } },
        axisTick: { show: false },
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
            `<strong>${escapeEChartsHtml(d.rawMaterial)}</strong>`,
            `Selection share: ${formatPercent(d.scopedShare)}`,
            `Global share: ${formatPercent(d.globalShare)}`,
            `Difference: ${formatPercent(d.shareDelta)}`,
            `Total RGO: ${formatLevel(d.totalRgoLevel)}`,
            `Locations: ${formatInt(d.locationCount)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          name: "Over",
          type: "bar",
          stack: "delta",
          encode: { x: "posBar", y: "rawMaterial" },
          itemStyle: { color: isDark ? "#f97316" : "#ea580c" },
        },
        {
          name: "Under",
          type: "bar",
          stack: "delta",
          encode: { x: "negBar", y: "rawMaterial" },
          itemStyle: { color: isDark ? "#38bdf8" : "#0ea5e9" },
        },
      ],
    };
  }, [isDark, data]);

  const height = data.length * 22 + 52;
  return <EChart option={option} style={{ height: `${height}px`, width: "100%" }} />;
}

const topLocColHelper = createColumnHelper<RgoTopLocation>();

function RgoTopLocationsTable({ locations }: { locations: RgoTopLocation[] }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();

  const columns = useMemo(
    () => [
      topLocColHelper.accessor("name", {
        sortingFn: "text",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Location" />,
        cell: ({ row }) => {
          const loc = row.original;
          return (
            <button
              type="button"
              className="text-left text-sky-300 hover:text-sky-200 hover:underline"
              onClick={() => {
                nav.pushMany(
                  [{ kind: "focus", locationIdx: loc.locationIdx, label: loc.name }],
                  BACK_LABEL,
                );
                panToEntity(loc.locationIdx);
              }}
            >
              {loc.name}
            </button>
          );
        },
      }),
      topLocColHelper.accessor("owner", {
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
                  [{ kind: "entity", anchorIdx: owner.anchorLocationIdx, label: owner.name }],
                  BACK_LABEL,
                );
                panToEntity(owner.anchorLocationIdx);
              }}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: owner.colorHex }}
              />
              <span className="truncate">{owner.name}</span>
            </button>
          );
        },
      }),
      topLocColHelper.accessor("rawMaterial", {
        sortingFn: "text",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Raw Material" />,
        cell: (info) => info.getValue(),
      }),
      topLocColHelper.accessor("rgoLevel", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="RGO Level" />,
        meta: { className: "text-right" },
        cell: (info) => formatLevel(info.getValue()),
      }),
    ],
    [nav, panToEntity],
  );

  return (
    <DataTable
      className="w-full"
      columns={columns}
      data={locations}
      initialSorting={[{ id: "rgoLevel", desc: true }]}
      pagination
    />
  );
}

export function RgoInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) => engine.trigger.getRgoInsight());

  const data: RgoInsightData | undefined = insightQuery.data ?? undefined;
  const materials = data?.materials ?? [];
  const profileDeltas = data?.profileDeltas ?? [];
  const topLocations = data?.topLocations ?? [];
  const scopeIsEmpty = data?.scope.isEmpty ?? true;

  return (
    <div className="flex flex-col gap-4 p-4">
      <RgoScopeHeader data={data?.scope} />
      {insightQuery.loading && !data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          {materials.length > 0 && (
            <section>
              <SectionTitle>What raw materials define this selection?</SectionTitle>
              <RawMaterialScatter materials={materials} />
            </section>
          )}

          {!scopeIsEmpty && profileDeltas.length > 0 && (
            <section>
              <SectionTitle>What makes this selection unusual?</SectionTitle>
              <RawMaterialProfileDeltaChart deltas={profileDeltas} />
            </section>
          )}

          {topLocations.length > 0 && (
            <section>
              <SectionTitle>Where are the strongest locations?</SectionTitle>
              <RgoTopLocationsTable locations={topLocations} />
            </section>
          )}

          {materials.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              No RGO data in the selected scope
            </p>
          )}
        </>
      )}
    </div>
  );
}
