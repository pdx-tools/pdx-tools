import { useMemo } from "react";
import type React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
import type {
  BuildingLevelsScopeSummary,
  BuildingTypeSummary,
  BuildingTypeForeignOwnerCell,
  BuildingLevelsTopLocation,
  ForeignBuildingLocationRow,
} from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
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

const BACK_LABEL = "Building Levels";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
      {children}
    </p>
  );
}

function formatLevels(value: number) {
  return formatInt(value);
}

function BuildingLevelsScopeHeader({ data }: { data?: BuildingLevelsScopeSummary }) {
  if (!data) return <InsightScopeHeaderSkeleton />;

  return (
    <InsightScopeHeader>
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem label="Levels" value={formatLevels(data.totalLevels)} />
      <StatItem label="Foreign Levels" value={formatLevels(data.foreignLevels)} />
    </InsightScopeHeader>
  );
}

function BuildingTypesChart({ types }: { types: BuildingTypeSummary[] }) {
  const isDark = isDarkMode();

  const rows = useMemo(
    () =>
      types.slice(0, 30).map((t) => ({
        ...t,
        domestic: t.levels - t.foreignLevels,
      })),
    [types],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      dataset: {
        source: rows,
        dimensions: ["kind", "domestic", "foreignLevels"],
      },
      grid: { left: 140, right: 24, top: 8, bottom: 64 },
      xAxis: {
        type: "value",
        name: "Building Levels",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: tickColor, fontSize: 10 },
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          formatter: (v: number) => formatInt(v),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { color: tickColor, fontSize: 11, fontWeight: 600, width: 130 },
        axisLine: { lineStyle: { color: axisColor } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          name: "Domestic",
          stack: "levels",
          itemStyle: { color: "#4e9e6b" },
          encode: { x: "domestic", y: "kind" },
        },
        {
          type: "bar",
          name: "Foreign",
          stack: "levels",
          itemStyle: { color: "#c0614a" },
          encode: { x: "foreignLevels", y: "kind" },
        },
      ],
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = (arr[0] as { dataIndex?: number } | undefined)?.dataIndex;
          if (idx == null) return "";
          const d = rows[idx];
          if (!d) return "";
          return [
            `<strong>${escapeEChartsHtml(d.kind)}</strong>`,
            `Domestic levels: ${formatLevels(d.domestic)}`,
            `Foreign levels: ${formatLevels(d.foreignLevels)}`,
            `Total levels: ${formatLevels(d.levels)}`,
            `Employed: ${formatFloat(d.employed, 1)}`,
            `Buildings: ${formatInt(d.buildingCount)}`,
            `Locations: ${formatInt(d.locationCount)}`,
            `Foreign owners: ${formatInt(d.foreignOwnerCount)}`,
          ].join("<br/>");
        },
      },
      legend: {
        data: ["Domestic", "Foreign"],
        textStyle: { color: tickColor, fontSize: 10 },
        top: "bottom",
      },
    };
  }, [isDark, rows]);

  const height = Math.max(120, rows.length * 28 + 40);
  return <EChart option={option} style={{ height: `${height}px`, width: "100%" }} />;
}

function ForeignShareCallout({ scope }: { scope: BuildingLevelsScopeSummary }) {
  const share = scope.totalLevels > 0 ? scope.foreignLevels / scope.totalLevels : 0;
  const pct = share * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-game-ink-300">
          Foreign-owned:{" "}
          <span className="font-semibold text-white">{formatLevels(scope.foreignLevels)}</span> /{" "}
          {formatLevels(scope.totalLevels)} levels
        </span>
        <span className="font-semibold text-[#c0614a]">{formatFloat(pct, 1)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-game-panel-hover">
        <div
          className="h-full rounded-full bg-[#c0614a]"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {(scope.foreignLocationCount > 0 || scope.foreignOwnerCount > 0) && (
        <p className="text-xs text-game-ink-500">
          {scope.foreignLocationCount > 0 && (
            <>
              {formatInt(scope.foreignLocationCount)} location
              {scope.foreignLocationCount !== 1 ? "s" : ""}
            </>
          )}
          {scope.foreignLocationCount > 0 && scope.foreignOwnerCount > 0 && " · "}
          {scope.foreignOwnerCount > 0 && (
            <>
              {formatInt(scope.foreignOwnerCount)} owner{scope.foreignOwnerCount !== 1 ? "s" : ""}
            </>
          )}
        </p>
      )}
    </div>
  );
}

const topLocColHelper = createColumnHelper<BuildingLevelsTopLocation>();

function DomesticTopLocationsTable({ locations }: { locations: BuildingLevelsTopLocation[] }) {
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
        cell: ({ row }) => (
          <EntityLink entity={row.original.owner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      topLocColHelper.accessor("levels", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Levels", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatLevels(info.getValue())}</Eu5DataTable.NumericCell>
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
      initialSorting={[{ id: "levels", desc: true }]}
      pagination
    />
  );
}

const foreignLocColHelper = createColumnHelper<ForeignBuildingLocationRow>();

function ForeignBuildingLocationTable({ rows }: { rows: ForeignBuildingLocationRow[] }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();

  const columns = useMemo(
    () => [
      foreignLocColHelper.accessor("locationName", {
        sortingFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <MapHoverButton
              target={{ kind: "location", locationIdx: r.locationIdx }}
              className="text-left text-game-accent-300 hover:text-game-accent-100 hover:underline"
              onClick={() => {
                nav.pushMany([locationProfileEntry(r.locationIdx, r.locationName)], BACK_LABEL);
                panToEntity(r.locationIdx);
              }}
            >
              {r.locationName}
            </MapHoverButton>
          );
        },
      }),
      foreignLocColHelper.accessor("locationOwner", {
        id: "locationOwner",
        sortingFn: (a, b) =>
          a.original.locationOwner.name.localeCompare(b.original.locationOwner.name),
        meta: Eu5DataTable.meta({ headerLabel: "Loc Owner" }),
        cell: ({ row }) => (
          <EntityLink entity={row.original.locationOwner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      foreignLocColHelper.accessor("foreignOwner", {
        id: "foreignOwner",
        sortingFn: (a, b) =>
          a.original.foreignOwner.name.localeCompare(b.original.foreignOwner.name),
        meta: Eu5DataTable.meta({ headerLabel: "Building Owner" }),
        cell: ({ row }) => (
          <EntityLink entity={row.original.foreignOwner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      foreignLocColHelper.accessor("kind", {
        sortingFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Type" }),
        cell: (info) => info.getValue(),
      }),
      foreignLocColHelper.accessor("foreignLevels", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Foreign Lvls", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatLevels(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [nav, panToEntity],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={rows}
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.locationIdx })}
      initialSorting={[{ id: "foreignLevels", desc: true }]}
      pagination
    />
  );
}

const foreignOwnerCellColHelper = createColumnHelper<BuildingTypeForeignOwnerCell>();

function ForeignOwnerCellsTable({ cells }: { cells: BuildingTypeForeignOwnerCell[] }) {
  const columns = useMemo(
    () => [
      foreignOwnerCellColHelper.accessor("owner", {
        id: "owner",
        sortingFn: (a, b) => a.original.owner.name.localeCompare(b.original.owner.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner", variant: "pin" }),
        cell: ({ row }) => (
          <EntityLink entity={row.original.owner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      foreignOwnerCellColHelper.accessor("kind", {
        sortingFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Type" }),
        cell: (info) => info.getValue(),
      }),
      foreignOwnerCellColHelper.accessor("levels", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Levels", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatLevels(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      foreignOwnerCellColHelper.accessor("buildingCount", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Buildings", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={cells}
      getRowHoverTarget={(row) =>
        row.owner.kind === "country"
          ? { kind: "country", countryIdx: row.owner.countryIdx }
          : { kind: "market", marketId: row.owner.marketId }
      }
      initialSorting={[{ id: "levels", desc: true }]}
      pagination
    />
  );
}

export function BuildingLevelsInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) =>
    engine.trigger.getBuildingLevelsInsight(),
  );

  const types = insightQuery.data?.types ?? [];
  const foreignOwnerCells = insightQuery.data?.foreignOwnerCells ?? [];
  const foreignLocationRows = insightQuery.data?.foreignLocationRows ?? [];
  const topLocations = insightQuery.data?.topLocations ?? [];
  const scope = insightQuery.data?.scope;
  const totalLevels = scope?.totalLevels ?? 0;
  const foreignLevels = scope?.foreignLevels ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <BuildingLevelsScopeHeader data={scope} />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {types.length > 0 && (
            <section>
              <SectionTitle>What is built here?</SectionTitle>
              <BuildingTypesChart types={types} />
            </section>
          )}

          {totalLevels > 0 && foreignLevels > 0 && scope && (
            <section>
              <SectionTitle>How foreign-owned is the built environment?</SectionTitle>
              <ForeignShareCallout scope={scope} />
            </section>
          )}

          {topLocations.length > 0 && (
            <section>
              <SectionTitle>Top building centers</SectionTitle>
              <DomesticTopLocationsTable locations={topLocations} />
            </section>
          )}

          {foreignLocationRows.length > 0 && (
            <section>
              <SectionTitle>Foreign-owned buildings</SectionTitle>
              <ForeignBuildingLocationTable rows={foreignLocationRows} />
            </section>
          )}

          {foreignOwnerCells.length > 0 && (
            <section>
              <SectionTitle>Foreign-owned building types</SectionTitle>
              <ForeignOwnerCellsTable cells={foreignOwnerCells} />
            </section>
          )}

          {types.length === 0 && (
            <Eu5InsightEmptyState title="No building data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}
