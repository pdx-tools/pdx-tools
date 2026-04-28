import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { Table } from "@/components/Table";
import type { TaxGapTopLocation } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import {
  countryProfileEntry,
  locationProfileEntry,
  usePanelNav,
} from "../../EntityProfile/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";

const BACK_LABEL = "Tax Gap";
const columnHelper = createColumnHelper<TaxGapTopLocation>();

export function TaxGapTopLocations({ locations }: { locations: TaxGapTopLocation[] }) {
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
      columnHelper.accessor("tax", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Location Tax" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor("possibleTax", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Possible Tax" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor("taxGap", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Gap" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor((row) => (row.possibleTax > 0 ? row.tax / row.possibleTax : 0), {
        id: "realization",
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Realization" />,
        meta: { className: "text-right" },
        cell: (info) => `${formatFloat(info.getValue() * 100, 1)}%`,
      }),
      columnHelper.accessor("development", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Development" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 1),
      }),
      columnHelper.accessor("control", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Control" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
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
        header: ({ column }) => <Table.ColumnHeader column={column} title="Population" />,
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
      initialSorting={[{ id: "taxGap", desc: true }]}
      pagination
    />
  );
}
