import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { createColumnHelper } from "@tanstack/react-table";
import { formatFloat, formatInt } from "@/lib/format";
import { Vic3Stats } from "./worker/types";

export interface CountryStatsProps {
  stats: [Vic3Stats];
}

export const CountryStatsTable = ({ stats }: CountryStatsProps) => {
  const columnHelper = createColumnHelper<Vic3Stats>();
  const columns = [
    columnHelper.accessor("date", {
      sortingFn: "basic",
      header: ({ column }) => (
        <Table.ColumnHeader column={column} title="Date" />
      ),
    }),
    columnHelper.accessor("gdp", {
      sortingFn: "basic",
      cell: (info) => formatFloat(info.getValue()),
      header: ({ column }) => (
        <Table.ColumnHeader column={column} title="GDP" />
      ),
    }),
    columnHelper.accessor("gdpc", {
      sortingFn: "basic",
      cell: (info) => formatFloat(info.getValue()),
      header: ({ column }) => (
        <Table.ColumnHeader column={column} title="GDP/c" />
      ),
    }),
    columnHelper.accessor("sol", {
      sortingFn: "basic",
      cell: (info) => formatFloat(info.getValue()),
      header: ({ column }) => (
        <Table.ColumnHeader column={column} title="SoL" />
      ),
    }),
  ];
  return (
    <DataTable
      data={stats.filter((_v, i, _) => i % 250 == 0)}
      columns={columns}
    />
  );
};
