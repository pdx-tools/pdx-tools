import { useCallback, useEffect } from "react";
import { useAnalysisWorker } from "../../worker";
import {
  ProvinceItem,
  ProvinceList,
} from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import { Alert } from "@/components/Alert";
import { Table } from "@/components/Table";
import { createColumnHelper } from "@tanstack/react-table";
import { Flag } from "../../components/avatars";
import { formatInt } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { useVisualizationDispatch } from "@/components/viz";
import { createCsv } from "@/lib/csv";

const columnHelper = createColumnHelper<ProvinceItem>();
const columns = [
  columnHelper.accessor((x) => `${x.name} (${x.id})`, {
    id: "name",
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Province" />
    ),
    enableColumnFilter: true,
  }),

  columnHelper.accessor("owner.tag", {
    enableColumnFilter: false,
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Owner" />
    ),
    cell: ({ row }) => (
      <Flag tag={row.original.owner.tag} name={row.original.owner.name} />
    ),
  }),

  columnHelper.accessor("tax", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Tax" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("production", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Production" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("manpower", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Manpower" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("development", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Development" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("religion", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Religion" />
    ),
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("culture", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Culture" />
    ),
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("tradeGoods", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="TradeGoods" />
    ),
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("devastation", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Devastation" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("inHre", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="In HRE" />
    ),
    cell: (info) => `${info.getValue()}`,
  }),

  columnHelper.accessor("exploitDate", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Exploit Date" />
    ),
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("expandInfrastructure", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Expand Infra." />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("numCentralizedState", {
    sortingFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Centralized State" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

function ProvinceTable({ data }: { data: ProvinceList | undefined }) {
  return (
    <DataTable
      columns={columns}
      data={data ?? []}
      pagination={true}
      initialSorting={[{ id: "development", desc: true }]}
      enableColumnFilters={true}
    />
  );
}

export function ProvinceDataTable() {
  const { data, error } = useAnalysisWorker(
    useCallback(async (worker) => worker.eu4GetProvinces(), []),
  );

  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        if (!data) {
          return "";
        }

        const dataCsv = data.map(({ owner, ...x }) => ({
          ...x,
          ownerTag: owner.tag,
          ownerName: owner.name,
        }));

        return createCsv(dataCsv, [
          "id",
          "name",
          "ownerTag",
          "ownerName",
          "tax",
          "production",
          "manpower",
          "development",
          "expandInfrastructure",
          "numCentralizedState",
          "religion",
          "culture",
          "tradeGoods",
          "devastation",
          "exploitDate",
          "inHre",
        ]);
      },
    });
  }, [data, visualizationDispatch]);

  return (
    <>
      <Alert.Error msg={error} />
      <ProvinceTable data={data} />
    </>
  );
}
