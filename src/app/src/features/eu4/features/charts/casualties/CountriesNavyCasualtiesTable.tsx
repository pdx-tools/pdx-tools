import React, { useEffect } from "react";
import { TableLosses, useCountryCasualtyData } from "./hooks";
import { CountriesNavyCasualtiesWarTable } from "./CountriesNavyCasualtiesWarTable";
import { Flag } from "@/features/eu4/components/avatars";
import { useVisualizationDispatch } from "@/components/viz";
import { formatInt } from "@/lib/format";
import { createCsv } from "@/lib/csv";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { SheetExpansion } from "../../../components/SheetExpansion";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";

const unitTypes = [
  ["Heavy", "heavyShip"],
  ["Light", "lightShip"],
  ["Galley", "galleyShip"],
  ["Trnsprt", "transportShip"],
  ["Total", "navyTotal"],
] as const;

const columnHelper = createColumnHelper<TableLosses>();
const columns = [
  columnHelper.display({
    id: "actions",
    cell: ({ row }) => (
      <SheetExpansion title={`${row.original.name} Casualty Breakdown`}>
        <CountriesNavyCasualtiesWarTable record={row.original} />
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

  columnHelper.group({
    header: "Losses from Captured Ships",
    columns: unitTypes.map(([title, type]) =>
      columnHelper.accessor(`${type}Capture`, {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title={title} />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ),
  }),

  columnHelper.accessor((x) => (x.navyTotalAttrition / x.navyTotal) * 100, {
    id: "attrition",
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="% from Attrition" />
    ),
    meta: { className: "text-right" },
    cell: (info) =>
      isNaN(info.getValue()) ? "0%" : formatInt(info.getValue()) + "%",
  }),

  columnHelper.accessor("navyTotal", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Total Losses" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

export const CountriesNavyCasualtiesTable = () => {
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
          ...unitTypes.map(
            ([_, type]) => `${type}Capture` as keyof TableLosses,
          ),
          "navyTotal",
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
        initialSorting={[{ id: "navyTotal", desc: true }]}
      />
    </>
  );
};
