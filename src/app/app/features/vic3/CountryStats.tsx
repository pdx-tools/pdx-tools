import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { createColumnHelper } from "@/lib/tanstack-table";
import { formatFloat } from "@/lib/format";
import type { Vic3GraphData } from "./worker/types";

export interface CountryStatsProps {
  stats: Vic3GraphData[];
}

export const CountryStatsTable = ({ stats }: CountryStatsProps) => {
  const columnHelper = createColumnHelper<Vic3GraphData>();
  const columns = [
    columnHelper.accessor("date", {
      sortFn: "basic",
      header: ({ column }) => <Table.ColumnHeader column={column} title="Date" />,
    }),
    columnHelper.accessor("gdp", {
      sortFn: "basic",
      cell: (info) => formatFloat(info.getValue()),
      meta: { className: "text-right" },
      header: ({ column }) => <Table.ColumnHeader column={column} title="GDP" />,
    }),
    columnHelper.accessor("gdpGrowth", {
      sortFn: "basic",
      cell: (info) => formatFloat(info.getValue() * 100, 2) + "%",
      meta: { className: "text-right" },
      header: ({ column }) => <Table.ColumnHeader column={column} title="GDP growth" />,
    }),
    columnHelper.accessor("gdpc", {
      sortFn: "basic",
      cell: (info) => formatFloat(info.getValue()),
      meta: { className: "text-right" },
      header: ({ column }) => <Table.ColumnHeader column={column} title="GDP/c" />,
    }),
    columnHelper.accessor("gdpcGrowth", {
      sortFn: "basic",
      cell: (info) => formatFloat(info.getValue() * 100, 2) + "%",
      meta: { className: "text-right" },
      header: ({ column }) => <Table.ColumnHeader column={column} title="GDP growth" />,
    }),
    columnHelper.accessor("sol", {
      sortFn: "basic",
      cell: (info) => formatFloat(info.getValue()),
      meta: { className: "text-right" },
      header: ({ column }) => <Table.ColumnHeader column={column} title="SoL" />,
    }),
  ];

  return <DataTable data={stats} columns={columns} />;
};
