import { useCallback, useEffect, useRef } from "react";
import { useAnalysisWorker } from "../../worker";
import type { ProvinceItem, ProvinceList } from "@/wasm/wasm_eu4";
import { Alert } from "@/components/Alert";
import { Table } from "@/components/Table";
import { createColumnHelper } from "@/lib/tanstack-table";
import type { AppTable } from "@/lib/tanstack-table";
import { Flag } from "../../components/avatars";
import { formatInt } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { useVisualizationDispatch } from "@/components/viz";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../store";

const yesNo = (value: boolean) => (value ? "Yes" : "No");

type FooterProps = { table: AppTable<ProvinceItem> };

function filteredProvinces(table: AppTable<ProvinceItem>) {
  return table.getFilteredRowModel().rows.map((row) => row.original);
}

/** A footer with the sum of a value over the provinces that the filters keep. */
function totalFooter(value: (province: ProvinceItem) => number) {
  return function TotalFooter({ table }: FooterProps) {
    const total = filteredProvinces(table).reduce((acc, x) => acc + value(x), 0);
    return formatInt(total);
  };
}

/**
 * A footer with the average of a value over the provinces that the filters
 * keep. Each province counts as much as its development.
 */
function averageFooter(value: (province: ProvinceItem) => number, unit = "") {
  return function AverageFooter({ table }: FooterProps) {
    let weighted = 0;
    let development = 0;
    for (const x of filteredProvinces(table)) {
      weighted += value(x) * x.development;
      development += x.development;
    }

    if (development === 0) {
      return null;
    }

    return (
      <span title="Average, weighted by development">
        {formatInt(weighted / development)}
        {unit} avg
      </span>
    );
  };
}

const columnHelper = createColumnHelper<ProvinceItem>();

const ownerColumn = columnHelper.accessor("owner.tag", {
  enableColumnFilter: false,
  sortFn: "basic",
  header: ({ column }) => <Table.ColumnHeader column={column} title="Owner" />,
  cell: ({ row }) => <Flag tag={row.original.owner.tag} name={row.original.owner.name} />,
});

const columns = [
  columnHelper.accessor((x) => `${x.name} (${x.id})`, {
    id: "name",
    sortFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Province" />,
    footer: () => "Total",
    enableColumnFilter: true,
  }),

  ownerColumn,

  columnHelper.accessor("tax", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Tax" />,
    footer: totalFooter((x) => x.tax),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("production", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Production" />,
    footer: totalFooter((x) => x.production),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("manpower", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Manpower" />,
    footer: totalFooter((x) => x.manpower),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("development", {
    sortFn: "basic",
    filterFn: "inNumberRange",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Development" />,
    footer: totalFooter((x) => x.development),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("autonomy", {
    sortFn: "basic",
    filterFn: "inNumberRange",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Autonomy" />,
    footer: averageFooter((x) => x.autonomy, "%"),
    meta: { className: "text-right" },
    cell: (info) => `${formatInt(info.getValue())}%`,
  }),

  columnHelper.accessor("religion", {
    sortFn: "basic",
    filterFn: "checklist",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Religion" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("culture", {
    sortFn: "basic",
    filterFn: "checklist",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Culture" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("tradeGoods", {
    sortFn: "basic",
    filterFn: "checklist",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Trade Goods" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("terrain", {
    sortFn: "basic",
    filterFn: "checklist",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Terrain" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("region", {
    sortFn: "basic",
    filterFn: "checklist",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Region" />,
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor("devastation", {
    sortFn: "basic",
    enableColumnFilter: false,
    header: ({ column }) => <Table.ColumnHeader column={column} title="Devastation" />,
    footer: averageFooter((x) => x.devastation),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor((x) => yesNo(x.inHre), {
    id: "inHre",
    sortFn: "basic",
    filterFn: "checklist",
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

// A table of one country's provinces does not need to show the owner.
const columnsWithoutOwner = columns.filter((column) => column !== ownerColumn);

type ProvinceTableProps = {
  provinces: ProvinceList | undefined;
  error: string | undefined;
  showOwner: boolean;
  onFilteredRowsChange?: (rows: ProvinceList) => void;
};

/** A table of provinces, with column filters and a totals row. */
export function ProvinceTable({
  provinces,
  error,
  showOwner,
  onFilteredRowsChange,
}: ProvinceTableProps) {
  return (
    <>
      <Alert.Error msg={error} />
      <DataTable
        columns={showOwner ? columns : columnsWithoutOwner}
        data={provinces ?? []}
        pagination={true}
        initialSorting={[{ id: "development", desc: true }]}
        enableColumnFilters={true}
        rowNoun="provinces"
        onFilteredRowsChange={onFilteredRowsChange}
      />
    </>
  );
}

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
          "terrain",
          "region",
          "devastation",
          "exploitDate",
          "inHre",
        ]);
      },
    });
  }, [visualizationDispatch]);

  return (
    <ProvinceTable
      provinces={data}
      error={error}
      showOwner={true}
      onFilteredRowsChange={onFilteredRowsChange}
    />
  );
}
