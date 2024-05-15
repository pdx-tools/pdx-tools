import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { createColumnHelper } from "@tanstack/react-table";
import { formatFloat } from "@/lib/format";
import { Vic3GoodPrice } from "./worker/types";

export interface CountryMarketProps {
  goods_prices: Vic3GoodPrice[];
}

export const CountryMarketTable = ({ goods_prices }: CountryMarketProps) => {
  const columnHelper = createColumnHelper<Vic3GoodPrice>();
  const columns = [
    columnHelper.accessor("good", {
      sortingFn: "basic",
      header: ({ column }) => (
        <Table.ColumnHeader column={column} title="Good" />
      ),
    }),
    columnHelper.accessor("price", {
      sortingFn: "basic",
      cell: (info) => formatFloat(info.getValue()),
      meta: { className: "text-right p-1" },
      header: ({ column }) => <Table.ColumnHeader column={column} title="£" />,
    }),
  ];

  return <DataTable data={goods_prices} columns={columns} />;
};
