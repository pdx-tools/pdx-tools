import React from "react";
import { rankDisplay } from "@/lib/ranks";
import { difficultySort, difficultyText } from "@/lib/difficulty";
import { Flag } from "@/features/eu4/components/avatars";
import { TimeAgo } from "@/components/TimeAgo";
import { formatInt } from "@/lib/format";
import { Tooltip } from "@/components/Tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { Link } from "@/components/Link";
import type { pdxApi } from "@/services/appApi";
import type { UseSuspenseQueryResult } from "@tanstack/react-query";

type AchievementData =
  ReturnType<
    (typeof pdxApi)["achievement"]["useGet"]
  > extends UseSuspenseQueryResult<infer T>
    ? T
    : never;

export type RankedSave = AchievementData["saves"][number];
interface RecordTableProps {
  records: RankedSave[];
}

const columnHelper = createColumnHelper<RankedSave>();

const columns = [
  columnHelper.accessor("rank", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Rank" />,
    cell: (info) => rankDisplay(info.getValue()),
  }),
  columnHelper.accessor("user_name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Player" />
    ),
    cell: (info) => (
      <Link href={`/users/${info.row.original.user_id}`}>
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("weighted_score.days", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Table.ColumnHeader column={column} title="Score" />
        </Tooltip.Trigger>
        <Tooltip.Content>Saves from older patches are taxed</Tooltip.Content>
      </Tooltip>
    ),
    cell: (info) => (
      <Tooltip>
        <Tooltip.Trigger>
          {info.row.original.weighted_score?.days
            ? formatInt(info.getValue())
            : "---"}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {formatInt(info.getValue())} @{" "}
          {info.row.original.patch.split(".").slice(0, 2).join(".")} ={" "}
          {info.row.original.weighted_score?.date}
        </Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.accessor("days", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Date" />,
    cell: (info) => (
      <Tooltip>
        <Tooltip.Trigger className="no-break">
          {info.row.original.date}
        </Tooltip.Trigger>
        <Tooltip.Content>{formatInt(info.getValue())}</Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.accessor("game_difficulty", {
    sortingFn: difficultySort,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Difficulty" />
    ),
    cell: (info) => difficultyText(info.getValue()),
  }),

  columnHelper.accessor("player_start_tag", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Starting" />
    ),
    cell: ({ row }) =>
      row.original.player_start_tag && row.original.player_start_tag_name ? (
        <Flag
          tag={row.original.player_start_tag}
          name={row.original.player_start_tag_name}
        />
      ) : (
        "Multiplayer"
      ),
  }),
  columnHelper.accessor("player_tag", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Current" />
    ),
    cell: ({ row }) => (
      <Flag
        tag={row.original.player_tag}
        name={row.original.player_tag_name ?? row.original.player_tag}
      />
    ),
  }),
  columnHelper.accessor("patch", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Patch" />
    ),
  }),

  columnHelper.accessor("upload_time", {
    sortingFn: "datetime",
    cell: (info) => <TimeAgo date={info.getValue()} />,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Uploaded" />
    ),
  }),

  columnHelper.display({
    id: "actions",
    cell: (info) => (
      <Link href={`/eu4/saves/${info.row.original.id}`}>View</Link>
    ),
  }),
];

export const RecordTable = ({ records }: RecordTableProps) => {
  return <DataTable columns={columns} data={records} />;
};
