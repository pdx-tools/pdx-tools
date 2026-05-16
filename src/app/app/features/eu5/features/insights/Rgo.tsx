import { useMemo } from "react";
import type React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
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
import { Eu5Icon } from "../../components/icons/Eu5Icon";
import { goodsIconHtml } from "../../components/icons/eu5IconHtml";
import {
  GOODS_CELL_SIZE_32,
  goodsAtlasData,
  goodsAtlasUrl32,
  goodsDimensions32,
} from "../../components/icons/goods";
import { InsightScopeHeader, InsightScopeHeaderSkeleton } from "../InsightScopeHeader";
import { StatItem } from "../profiles/components/StatItem";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { usePanToEntity } from "../../usePanToEntity";
import { MapHoverButton } from "../../MapHoverButton";
import { locationProfileEntry, usePanelNav } from "../profiles/PanelNavContext";
import { EntityLink } from "../profiles/EntityLink";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";

const BACK_LABEL = "RGO";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
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
    const fallbackColor = isDark ? "#60a5fa" : "#2563eb";

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
            `<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle">${goodsIconHtml(d.rawMaterial)}<strong>${escapeEChartsHtml(d.rawMaterial)}</strong></span>`,
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
          type: "custom",
          data: scatterData.map((d) => ({
            value: d.value,
            rawMaterial: d.rawMaterial,
            colorHex: d.colorHex ?? fallbackColor,
            locationCount: d.locationCount,
          })),
          renderItem: (params, api) => {
            const { dataIndex } = params;
            const d = scatterData[dataIndex];
            if (!d) return undefined;
            const point = api.coord(d.value as [number, number]);
            const scaled = Math.sqrt((d.locationCount / maxLocCount) * 900) + 8;
            const size = Math.max(10, Math.min(48, scaled));
            const half = size / 2;
            const x = point[0] - half;
            const y = point[1] - half;

            let atlasIndex = goodsAtlasData[d.rawMaterial];
            if (atlasIndex === undefined) atlasIndex = goodsAtlasData["_default"];

            if (atlasIndex !== undefined) {
              const { row, col } = goodsDimensions32.coordinates(atlasIndex);
              const scale = size / GOODS_CELL_SIZE_32;
              const spriteX = col * GOODS_CELL_SIZE_32 * scale;
              const spriteY = row * GOODS_CELL_SIZE_32 * scale;
              const atlasTotalW = goodsDimensions32.cols * GOODS_CELL_SIZE_32 * scale;
              const atlasTotalH = goodsDimensions32.rows * GOODS_CELL_SIZE_32 * scale;
              return {
                type: "group" as const,
                x,
                y,
                clipPath: {
                  type: "rect" as const,
                  shape: { x: 0, y: 0, width: size, height: size },
                },
                children: [
                  {
                    type: "image" as const,
                    style: {
                      image: goodsAtlasUrl32,
                      x: -spriteX,
                      y: -spriteY,
                      width: atlasTotalW,
                      height: atlasTotalH,
                      opacity: 0.9,
                    },
                  },
                ],
              };
            }
            return {
              type: "circle" as const,
              shape: { cx: point[0], cy: point[1], r: half },
              style: { fill: d.colorHex ?? fallbackColor, opacity: 0.75 },
            };
          },
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
            `<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle">${goodsIconHtml(d.rawMaterial)}<strong>${escapeEChartsHtml(d.rawMaterial)}</strong></span>`,
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
      topLocColHelper.accessor("owner", {
        id: "owner",
        sortingFn: (a, b) => a.original.owner.name.localeCompare(b.original.owner.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => <EntityLink entity={row.original.owner} backLabel={BACK_LABEL} />,
      }),
      topLocColHelper.accessor("rawMaterial", {
        sortingFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Raw Material" }),
        cell: (info) => {
          const id = info.getValue();
          return (
            <span className="inline-flex items-center gap-1.5">
              <Eu5Icon family="goods" id={id} size="sm" />
              <span>{id}</span>
            </span>
          );
        },
      }),
      topLocColHelper.accessor("rgoLevel", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "RGO Level", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatLevel(info.getValue())}</Eu5DataTable.NumericCell>
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
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !data ? (
        <Eu5InsightLoadingState />
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
              <SectionTitle>Top RGO locations</SectionTitle>
              <RgoTopLocationsTable locations={topLocations} />
            </section>
          )}

          {materials.length === 0 && (
            <Eu5InsightEmptyState title="No RGO data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}
