import type { LocationProfile, LocationPopRow } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { PopulationSankey } from "../../features/charts/Population";

interface Props {
  profile: LocationProfile;
}

const columnHelper = createColumnHelper<LocationPopRow>();

const columns = [
  columnHelper.accessor("kind", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Kind" />,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("cultureName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Culture" />,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("religionName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Religion" />,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("size", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Size" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
  columnHelper.accessor("satisfaction", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Satisfaction" />,
    meta: { className: "text-right" },
    cell: (info) => `${formatFloat(info.getValue() * 100, 1)}%`,
  }),
  columnHelper.accessor("literacy", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Literacy" />,
    meta: { className: "text-right" },
    cell: (info) => `${formatFloat(info.getValue() * 100, 1)}%`,
  }),
];

export function LocationPopulationTab({ profile }: Props) {
  const rows = profile.populationProfile;

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No population data.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PopulationSankey rows={rows} />
      <DataTable columns={columns} data={rows} initialSorting={[{ id: "size", desc: true }]} />
    </div>
  );
}
