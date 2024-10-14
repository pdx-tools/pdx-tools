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

interface CountryNavyCasualtiesWarTableProps {
  record: TableLosses;
}

const unitTypes = [
  ["Heavy", "heavyShip"],
  ["Light", "lightShip"],
  ["Galley", "galleyShip"],
  ["Trnsprt", "transportShip"],
  ["Total", "navyTotal"],
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

  columnHelper.group({
    header: "Losses from Captured Ships",
    columns: unitTypes.map(([title, type]) =>
      columnHelper.accessor(`losses.${type}Capture`, {
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
    (x) => (x.losses.navyTotalAttrition / x.losses.navyTotal) * 100,
    {
      id: "attrition",
      sortingFn: "basic",
      header: ({ column }) => (
        <Table.ColumnHeader column={column} title="% from Attrition" />
      ),
      meta: { className: "text-right" },
      cell: (info) =>
        isNaN(info.getValue()) ? "0%" : formatInt(info.getValue()) + "%",
    },
  ),

  columnHelper.accessor("losses.navyTotal", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Total Losses" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

export const CountriesNavyCasualtiesWarTable = ({
  record,
}: CountryNavyCasualtiesWarTableProps) => {
  const { data: wars = [], error } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetSingleCountryCasualties(record.tag),
      [record.tag],
    ),
  );

  const fieldSum = (k: keyof Losses) =>
    wars.reduce((acc, x) => acc + x.losses[k], 0);
  const total = fieldSum("navyTotal");
  const totalAttrition = fieldSum("navyTotalAttrition");
  const heavyShipBattle = fieldSum("heavyShipBattle");
  const lightShipBattle = fieldSum("lightShipBattle");
  const galleyShipBattle = fieldSum("galleyShipBattle");
  const transportShipBattle = fieldSum("transportShipBattle");
  const navyBattle = fieldSum("navyTotalBattle");
  const heavyShipAttrition = fieldSum("heavyShipAttrition");
  const lightShipAttrition = fieldSum("lightShipAttrition");
  const galleyShipAttrition = fieldSum("galleyShipAttrition");
  const transportShipAttrition = fieldSum("transportShipAttrition");
  const navyAttrition = fieldSum("navyTotalAttrition");
  const heavyShipCapture = fieldSum("heavyShipCapture");
  const lightShipCapture = fieldSum("lightShipCapture");
  const galleyShipCapture = fieldSum("galleyShipCapture");
  const transportShipCapture = fieldSum("transportShipCapture");
  const navyCapture = fieldSum("navyTotalCapture");

  return (
    <>
      <Alert.Error msg={error} />
      <DataTable
        columns={columns}
        data={wars}
        pagination={true}
        summary={
          <Table.Row>
            <Table.Cell colSpan={4}>Other</Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.heavyShipBattle - heavyShipBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.lightShipBattle - lightShipBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.galleyShipBattle - galleyShipBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.transportShipBattle - transportShipBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.navyTotalBattle - navyBattle)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.heavyShipAttrition - heavyShipAttrition)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.lightShipAttrition - lightShipAttrition)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.galleyShipAttrition - galleyShipAttrition)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(
                record.transportShipAttrition - transportShipAttrition,
              )}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.navyTotalAttrition - navyAttrition)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.heavyShipCapture - heavyShipCapture)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.lightShipCapture - lightShipCapture)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.galleyShipCapture - galleyShipCapture)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.transportShipCapture - transportShipCapture)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.navyTotalCapture - navyCapture)}
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(
                ((record.navyTotalAttrition - totalAttrition) /
                  (record.navyTotal - total)) *
                  100,
              )}
              %
            </Table.Cell>
            <Table.Cell className="text-right">
              {formatInt(record.navyTotal - total)}
            </Table.Cell>
          </Table.Row>
        }
      />
    </>
  );
};
