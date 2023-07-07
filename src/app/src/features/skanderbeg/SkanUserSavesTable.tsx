import React from "react";
import type { SkanSave } from "./skanTypes";
import { TimeAgo } from "@/components/TimeAgo";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { Link } from "@/components/Link";

interface SkanUserSavesProp {
  records: SkanSave[];
}

const columnHelper = createColumnHelper<SkanSave>();

const columns = [
  columnHelper.accessor("timestamp", {
    sortingFn: "datetime",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Uploaded" />
    ),
    cell: (info) => <TimeAgo date={info.getValue()} />,
  }),
  columnHelper.accessor("name", {
    sortingFn: "text",
    header: "Name",
  }),
  columnHelper.accessor("date", {
    header: "Date",
    meta: { className: "no-break" },
  }),
  columnHelper.accessor("player", {
    sortingFn: "text",
    header: "Player",
    meta: { className: "no-break" },
  }),
  columnHelper.accessor("version", {
    sortingFn: "alphanumeric",
    header: "Patch",
    meta: { className: "no-break" },
  }),
  columnHelper.display({
    id: "actions",
    cell: ({ row }) => (
      <Link href={`/eu4/skanderbeg/${row.original.hash}`}>View</Link>
    ),
  }),
];

export const SkanUserSavesTable = ({ records }: SkanUserSavesProp) => {
  return <DataTable columns={columns} data={records} />;
};
