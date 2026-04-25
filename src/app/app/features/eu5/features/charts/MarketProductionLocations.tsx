import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { Table } from "@/components/Table";
import type { ProductionLocationSummary } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { usePanelNav } from "../../EntityProfile/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";

const BACK_LABEL = "Markets";
const columnHelper = createColumnHelper<ProductionLocationSummary>();

export function MarketProductionLocations({
  locations,
}: {
  locations: ProductionLocationSummary[];
}) {
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
      columnHelper.accessor("rawMaterial", {
        sortingFn: (a, b) =>
          (a.original.rawMaterial ?? "").localeCompare(b.original.rawMaterial ?? ""),
        header: ({ column }) => <Table.ColumnHeader column={column} title="Good" />,
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("marketCenterName", {
        sortingFn: (a, b) =>
          (a.original.marketCenterName ?? "").localeCompare(b.original.marketCenterName ?? ""),
        header: ({ column }) => <Table.ColumnHeader column={column} title="Market" />,
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("rgoLevel", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="RGO" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 0),
      }),
      columnHelper.accessor("marketAccess", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Access" />,
        meta: { className: "text-right" },
        cell: (info) => `${formatFloat(info.getValue() * 100, 0)}%`,
      }),
      columnHelper.accessor("goodPrice", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Price" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor("goodShortageValue", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Shortage $" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 0),
      }),
      columnHelper.accessor("productionOpportunity", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Opportunity" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 0),
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
      columnHelper.accessor("development", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Dev" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 1),
      }),
      columnHelper.accessor("population", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Pop" />,
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
      initialSorting={[{ id: "productionOpportunity", desc: true }]}
      pagination
    />
  );
}
