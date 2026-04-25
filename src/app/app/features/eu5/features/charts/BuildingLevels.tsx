import { useMemo } from "react";
import type React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { DataTable } from "@/components/DataTable";
import { Table } from "@/components/Table";
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
import { StatItem } from "../../EntityProfile/components/StatItem";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { usePanToEntity } from "../../usePanToEntity";
import { usePanelNav } from "../../EntityProfile/PanelNavContext";

const BACK_LABEL = "Building Levels";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
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
        <span className="text-slate-300">
          Foreign-owned:{" "}
          <span className="font-semibold text-white">{formatLevels(scope.foreignLevels)}</span> /{" "}
          {formatLevels(scope.totalLevels)} levels
        </span>
        <span className="font-semibold text-[#c0614a]">{formatFloat(pct, 1)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#c0614a]"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {(scope.foreignLocationCount > 0 || scope.foreignOwnerCount > 0) && (
        <p className="text-xs text-slate-500">
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
      topLocColHelper.accessor("levels", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Levels" />,
        meta: { className: "text-right" },
        cell: (info) => formatLevels(info.getValue()),
      }),
    ],
    [nav, panToEntity],
  );

  return (
    <DataTable
      className="w-full"
      columns={columns}
      data={locations}
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
        header: ({ column }) => <Table.ColumnHeader column={column} title="Location" />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <button
              type="button"
              className="text-left text-sky-300 hover:text-sky-200 hover:underline"
              onClick={() => {
                nav.pushMany(
                  [{ kind: "focus", locationIdx: r.locationIdx, label: r.locationName }],
                  BACK_LABEL,
                );
                panToEntity(r.locationIdx);
              }}
            >
              {r.locationName}
            </button>
          );
        },
      }),
      foreignLocColHelper.accessor("locationOwner", {
        id: "locationOwner",
        sortingFn: (a, b) =>
          a.original.locationOwner.name.localeCompare(b.original.locationOwner.name),
        header: ({ column }) => <Table.ColumnHeader column={column} title="Loc Owner" />,
        cell: ({ row }) => {
          const owner = row.original.locationOwner;
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
      foreignLocColHelper.accessor("foreignOwner", {
        id: "foreignOwner",
        sortingFn: (a, b) =>
          a.original.foreignOwner.name.localeCompare(b.original.foreignOwner.name),
        header: ({ column }) => <Table.ColumnHeader column={column} title="Building Owner" />,
        cell: ({ row }) => {
          const owner = row.original.foreignOwner;
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
              {owner.tag && <span className="font-mono text-xs text-slate-500">{owner.tag}</span>}
              <span className="truncate">{owner.name}</span>
            </button>
          );
        },
      }),
      foreignLocColHelper.accessor("kind", {
        sortingFn: "text",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Type" />,
        cell: (info) => info.getValue(),
      }),
      foreignLocColHelper.accessor("foreignLevels", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Foreign Lvls" />,
        meta: { className: "text-right" },
        cell: (info) => formatLevels(info.getValue()),
      }),
    ],
    [nav, panToEntity],
  );

  return (
    <DataTable
      className="w-full"
      columns={columns}
      data={rows}
      initialSorting={[{ id: "foreignLevels", desc: true }]}
      pagination
    />
  );
}

const foreignOwnerCellColHelper = createColumnHelper<BuildingTypeForeignOwnerCell>();

function ForeignOwnerCellsTable({ cells }: { cells: BuildingTypeForeignOwnerCell[] }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();

  const columns = useMemo(
    () => [
      foreignOwnerCellColHelper.accessor("owner", {
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
              {owner.tag && <span className="font-mono text-xs text-slate-500">{owner.tag}</span>}
              <span className="truncate">{owner.name}</span>
            </button>
          );
        },
      }),
      foreignOwnerCellColHelper.accessor("kind", {
        sortingFn: "text",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Type" />,
        cell: (info) => info.getValue(),
      }),
      foreignOwnerCellColHelper.accessor("levels", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Levels" />,
        meta: { className: "text-right" },
        cell: (info) => formatLevels(info.getValue()),
      }),
      foreignOwnerCellColHelper.accessor("buildingCount", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Buildings" />,
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
      data={cells}
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
      {insightQuery.loading && !insightQuery.data ? (
        <div className="h-64 animate-pulse rounded bg-white/5" />
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
            <p className="py-6 text-center text-sm text-slate-500">
              No building data in the selected scope
            </p>
          )}
        </>
      )}
    </div>
  );
}
