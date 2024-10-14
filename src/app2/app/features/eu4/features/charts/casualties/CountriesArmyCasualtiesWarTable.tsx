import React, { useCallback } from "react";
import { TableLosses } from "./hooks";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { formatFloat, formatInt } from "@/lib/format";
import { type SingleCountryWarCasualties } from "@/features/eu4/worker/module";
import { Tooltip } from "@/components/Tooltip";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { Losses } from "@/features/eu4/utils/losses";

interface CountryArmyCasualtiesWarTableProps {
  record: TableLosses;
}

const unitTypes = [
  ["Inf", "infantry"],
  ["Cav", "cavalry"],
  ["Art", "artillery"],
  ["Total", "landTotal"],
] as const;

const columnHelper = createColumnHelper<SingleCountryWarCasualties>();
const columns = [
  columnHelper.accessor("war", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="War" />,
  }),

  columnHelper.accessor("start", {
    sortingFn: "alphanumeric",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Start" />
    ),
    meta: { className: "text-right no-break" },
    cell: (info) => info.getValue() ?? "---",
  }),

  columnHelper.accessor("end", {
    sortingFn: "alphanumeric",
    header: ({ column }) => <Table.ColumnHeader column={column} title="End" />,
    meta: { className: "text-right no-break" },
    cell: (info) => info.getValue() ?? "---",
  }),

  columnHelper.accessor("participation", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Participation" />
    ),
    meta: { className: "text-right" },
    cell: ({ row }) => (
      <Tooltip>
        <Tooltip.Trigger>
          {formatInt(row.original.participation_percent * 100)}%
        </Tooltip.Trigger>
        <Tooltip.Content>
          {formatFloat(row.original.participation)}
        </Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.group({
    header: "Battle Losses",
    columns: unitTypes.map(([title, type]) =>
      columnHelper.accessor(`losses.${type}Battle`, {
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
      columnHelper.accessor(`losses.${type}Attrition`, {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title={title} />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ),
  }),

  columnHelper.accessor(
    (x) => (x.losses.landTotalAttrition / x.losses.landTotal) * 100,
    {
      id: "attrition",
      sortingFn: "basic",
      header: ({ column }) => (
        <Table.ColumnHeader column={column} title="% from Attrition" />
      ),
      meta: { className: "text-right" },
      cell: (info) =>
        isNaN(info.getValue()) ? "0" : formatInt(info.getValue()) + "%",
    },
  ),

  columnHelper.accessor("losses.landTotal", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Total Losses" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

export const CountriesArmyCasualtiesWarTable = ({
  record,
}: CountryArmyCasualtiesWarTableProps) => {
  const { data: wars = [], error } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetSingleCountryCasualties(record.tag),
      [record.tag],
    ),
  );

  const fieldSum = (k: keyof Losses) =>
    wars.reduce((acc, x) => acc + x.losses[k], 0);
  const total = fieldSum("landTotal");
  const totalAttrition = fieldSum("landTotalAttrition");
  const infantryBattle = fieldSum("infantryBattle");
  const cavalryBattle = fieldSum("cavalryBattle");
  const artilleryBattle = fieldSum("artilleryBattle");
  const landBattle = fieldSum("landTotalBattle");
  const infantryAttrition = fieldSum("infantryAttrition");
  const cavalryAttrition = fieldSum("cavalryAttrition");
  const artilleryAttrition = fieldSum("artilleryAttrition");
  const landAttrition = fieldSum("landTotalAttrition");
  return (
    <>
      <Alert.Error msg={error} />
      <DataTable
        columns={columns}
        data={wars}
        pagination={true}
        summary={
          <Table.Row>
            <Table.Cell colSpan={4}>Friendly Attrition / Rebels</Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.infantryBattle - infantryBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.cavalryBattle - cavalryBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.artilleryBattle - artilleryBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.landTotalBattle - landBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.infantryAttrition - infantryAttrition)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.cavalryAttrition - cavalryAttrition)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.artilleryAttrition - artilleryAttrition)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.landTotalAttrition - landAttrition)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(
                ((record.landTotalAttrition - totalAttrition) /
                  (record.landTotal - total)) *
                  100,
              )}
              %
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.landTotal - total)}
            </Table.Cell>
          </Table.Row>
        }
      />
    </>
  );
};
