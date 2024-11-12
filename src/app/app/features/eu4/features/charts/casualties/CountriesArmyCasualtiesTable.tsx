import React, { useEffect } from "react";
import { TableLosses, useCountryCasualtyData } from "./hooks";
import { useVisualizationDispatch } from "@/components/viz/visualization-context";
import { formatInt } from "@/lib/format";
import { Flag } from "@/features/eu4/components/avatars";
import { createCsv } from "@/lib/csv";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { SheetExpansion } from "../../../components/SheetExpansion";
import { CountriesArmyCasualtiesWarTable } from "./CountriesArmyCasualtiesWarTable";

const unitTypes = [
  ["Inf", "infantry"],
  ["Cav", "cavalry"],
  ["Art", "artillery"],
  ["Total", "landTotal"],
] as const;

const columnHelper = createColumnHelper<TableLosses>();
const columns = [
  columnHelper.display({
    id: "actions",
    cell: ({ row }) => (
      <SheetExpansion title={`${row.original.name} Casualty Breakdown`}>
        <CountriesArmyCasualtiesWarTable record={row.original} />
      </SheetExpansion>
    ),
  }),

  columnHelper.accessor("name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => <Flag tag={row.original.tag} name={row.original.name} />,
  }),

  columnHelper.group({
    header: "Battle Losses",
    columns: unitTypes.map(([title, type]) =>
      columnHelper.accessor(`${type}Battle`, {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title={title} />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ),
  }),

  columnHelper.group({
    header: "Attrition Losses",
    columns: unitTypes.map(([title, type]) =>
      columnHelper.accessor(`${type}Attrition`, {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title={title} />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ),
  }),

  columnHelper.accessor((x) => (x.landTotalAttrition / x.landTotal) * 100, {
    id: "attrition",
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="% from Attrition" />
    ),
    meta: { className: "text-right" },
    cell: (info) =>
      isNaN(info.getValue()) ? "0%" : formatInt(info.getValue()) + "%",
  }),

  columnHelper.accessor("landTotal", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Total Losses" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

export const CountriesArmyCasualtiesTable = () => {
  const casualties = useCountryCasualtyData();
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const keys: (keyof TableLosses)[] = [
          "tag",
          "name",
          ...unitTypes.map(([_, type]) => `${type}Battle` as keyof TableLosses),
          ...unitTypes.map(
            ([_, type]) => `${type}Attrition` as keyof TableLosses,
          ),
          "landTotal",
        ];
        return createCsv(casualties.data, keys);
      },
    });
  }, [casualties.data, visualizationDispatch]);

  return (
    <>
      <Alert.Error msg={casualties.error} />
      <DataTable
        columns={columns}
        data={casualties.data}
        pagination={true}
        initialSorting={[{ id: "landTotal", desc: true }]}
      />
    </>
  );
};
