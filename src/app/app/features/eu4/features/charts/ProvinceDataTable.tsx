import { useCallback, useEffect, useRef } from "react";
import { useAnalysisWorker } from "../../worker";
import type { ProvinceItem, ProvinceList } from "@/wasm/wasm_eu4";
import { Alert } from "@/components/Alert";
import { Table } from "@/components/Table";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Flag } from "../../components/avatars";
import { formatInt } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { useVisualizationDispatch } from "@/components/viz";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../store";

const yesNo = (value: boolean) => (value ? "Yes" : "No");

const columnHelper = createColumnHelper<ProvinceItem>();
const columns = [
  columnHelper.accessor((x) => `${x.name} (${x.id})`, {
    id: "name",
    sortFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Province" />,
    enableColumnFilter: true,
  }),

  columnHelper.accessor("owner.tag", {
    enableColumnFilter: false,
    sortFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Owner" />,
    cell: ({ row }) => <Flag tag={row.original.owner.tag} name={row.original.owner.name} />,
  }),

  columnHelper.accessor("terrain", {
    sortFn: "basic",
    filterFn: "excludes",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Terrain" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("tax", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Tax" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("production", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Production" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("manpower", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Manpower" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("development", {
    sortFn: "basic",
    filterFn: "inNumberRange",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Development" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("autonomy", {
    sortFn: "basic",
    filterFn: "inNumberRange",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Autonomy" />,
    meta: { className: "text-right" },
    cell: (info) => `${formatInt(info.getValue())}%`,
  }),

  columnHelper.accessor("religion", {
    sortFn: "basic",
    filterFn: "excludes",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Religion" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("culture", {
    sortFn: "basic",
    filterFn: "excludes",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Culture" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("tradeGoods", {
    sortFn: "basic",
    filterFn: "excludes",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Trade Goods" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("devastation", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Devastation" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor((x) => yesNo(x.inHre), {
    id: "inHre",
    sortFn: "basic",
    filterFn: "excludes",
    header: ({ column }) => <Table.ColumnHeader column={column} title="In HRE" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("exploitDate", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Exploit Date" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("expandInfrastructure", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Expand Infra." />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("numCentralizedState", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Centralized State" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

export function ProvinceDataTable() {
  const countryFilter = useTagFilter();
  const { data, error } = useAnalysisWorker(
    useCallback(async (worker) => worker.eu4GetProvinces(countryFilter), [countryFilter]),
  );

  // The CSV export holds only the rows that the column filters keep.
  const filteredRows = useRef<ProvinceList>([]);
  const onFilteredRowsChange = useCallback((rows: ProvinceList) => {
    filteredRows.current = rows;
  }, []);

  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const dataCsv = filteredRows.current.map(({ owner, ...x }) => ({
          ...x,
          ownerTag: owner.tag,
          ownerName: owner.name,
        }));

        return createCsv(dataCsv, [
          "id",
          "name",
          "ownerTag",
          "ownerName",
          "terrain",
          "tax",
          "production",
          "manpower",
          "development",
          "autonomy",
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
  }, [visualizationDispatch]);

  return (
    <>
      <Alert.Error msg={error} />
      <DataTable
        columns={columns}
        data={data ?? []}
        pagination={true}
        initialSorting={[{ id: "development", desc: true }]}
        enableColumnFilters={true}
        rowNoun="provinces"
        onFilteredRowsChange={onFilteredRowsChange}
      />
    </>
  );
}
