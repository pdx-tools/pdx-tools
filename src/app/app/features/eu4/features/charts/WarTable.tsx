import React, { useCallback, useEffect } from "react";
import { BattleView } from "./BattleView";
import { formatInt } from "@/lib/format";
import { Flag } from "@/features/eu4/components/avatars";
import { createCsv } from "@/lib/csv";
import { useVisualizationDispatch } from "@/components/viz";
import { useEu4Worker } from "@/features/eu4/worker";
import { useTagFilter } from "../../store";
import { War, WarSide } from "../../worker/module";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { SheetExpansion } from "../../components/SheetExpansion";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";

interface WarSideData extends WarSide {}

interface WarTableData extends War {
  key: number;
  attackers: WarSideData;
  defenders: WarSideData;
}

function FlagColumn({ data }: { data: WarSideData }) {
  return (
    <Flag tag={data.original.tag} name={data.original.name}>
      <Flag.CountryName />
      <div className="flex items-start gap-2">
        <Flag.Tooltip asChild showName>
          <Flag.DrawerTrigger>
            <Flag.Image />
          </Flag.DrawerTrigger>
        </Flag.Tooltip>

        <div className="flex w-20 flex-wrap">
          {data.members.slice(1, 30).map((x) => (
            <Flag tag={x.country.tag} key={x.country.tag} name={x.country.name}>
              <Flag.Tooltip showName>
                <Flag.Image size="xs" />
              </Flag.Tooltip>
            </Flag>
          ))}
        </div>
      </div>
    </Flag>
  );
}

const columnHelper = createColumnHelper<WarTableData>();
const columns = [
  columnHelper.display({
    id: "actions",
    cell: ({ row }) => (
      <SheetExpansion title={`${row.original.name} Breakdown`}>
        <BattleView warName={row.original.name} />
      </SheetExpansion>
    ),
  }),

  columnHelper.accessor("name", {
    sortingFn: "text",
    meta: { className: "min-w-[180px]" },
    header: ({ column }) => <Table.ColumnHeader column={column} title="Name" />,
  }),

  columnHelper.accessor("start_date", {
    sortingFn: "alphanumeric",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Start" />
    ),
    meta: { className: "text-right no-break" },
    cell: (info) => info.getValue() ?? "---",
  }),

  columnHelper.accessor("end_date", {
    sortingFn: "alphanumeric",
    header: ({ column }) => <Table.ColumnHeader column={column} title="End" />,
    meta: { className: "text-right no-break" },
    cell: (info) => info.getValue() ?? "---",
  }),

  columnHelper.accessor("days", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Days" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("attackers.original", {
    header: "Attackers",
    cell: (info) => <FlagColumn data={info.row.original.attackers} />,
    meta: { className: "align-top" },
  }),

  columnHelper.accessor("defenders.original", {
    header: "Defenders",
    cell: (info) => <FlagColumn data={info.row.original.defenders} />,
    meta: { className: "align-top" },
  }),

  columnHelper.accessor("battles", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Battles" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.group({
    header: "Total Losses",
    columns: [
      columnHelper.accessor("totalBattleLosses", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Battle" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      columnHelper.accessor("totalAttritionLosses", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Attrition" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
  }),

  columnHelper.group({
    header: "Attacker Losses",
    columns: [
      columnHelper.accessor("attackers.losses.totalBattle", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Battle" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      columnHelper.accessor("attackers.losses.totalAttrition", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Attrition" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
  }),

  columnHelper.group({
    header: "Defender Losses",
    columns: [
      columnHelper.accessor("defenders.losses.totalBattle", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Battle" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      columnHelper.accessor("defenders.losses.totalAttrition", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Attrition" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
  }),
];

export const WarTable = () => {
  const filter = useTagFilter();
  const visualizationDispatch = useVisualizationDispatch();

  const { data = [], error } = useEu4Worker(
    useCallback(
      async (worker) => {
        const data = await worker.eu4GetWars(filter);
        return data.map((x, i) => ({
          ...x,
          key: i,
        }));
      },
      [filter],
    ),
  );

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const dataCsv = data.map((x) => ({
          ...x,
          attacker_main: x.attackers.original.tag,
          attacker_main_name: x.attackers.original.name,
          attacker_members: `"{${x.attackers.members.map((y) => y.country.tag).join(",")}}"`,
          attacker_battle_losses: x.attackers.losses.totalBattle,
          attacker_attrition_losses: x.attackers.losses.totalAttrition,
          defender_main: x.defenders.original.tag,
          defender_main_name: x.defenders.original.name,
          defender_members: `"{${x.defenders.members.map((y) => y.country.tag).join(",")}}"`,
          defender_battle_losses: x.defenders.losses.totalBattle,
          defender_attrition_losses: x.defenders.losses.totalAttrition,
        }));

        return createCsv(dataCsv, [
          "name",
          "start_date",
          "end_date",
          "days",
          "attacker_main",
          "attacker_main_name",
          "attacker_members",
          "attacker_battle_losses",
          "attacker_attrition_losses",
          "defender_main",
          "defender_main_name",
          "defender_members",
          "defender_battle_losses",
          "defender_attrition_losses",
          "battles",
        ]);
      },
    });
  }, [data, visualizationDispatch]);

  return (
    <>
      <Alert.Error msg={error} />
      <DataTable
        columns={columns}
        data={data}
        pagination={true}
        initialSorting={[{ id: "totalBattleLosses", desc: true }]}
      />
    </>
  );
};
