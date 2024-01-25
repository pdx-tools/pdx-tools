import React, { useMemo } from "react";
import { TimeAgo } from "@/components/TimeAgo";
import { Button } from "@/components/Button";
import { difficultyText, difficultySort } from "@/lib/difficulty";
import { SaveFile, pdxApi } from "@/services/appApi";
import { Flag, AchievementAvatar } from "@/features/eu4/components/avatars";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { Link } from "@/components/Link";
import { Alert } from "@/components/Alert";

const columnHelper = createColumnHelper<SaveFile>();
const columns = [
  columnHelper.accessor("upload_time", {
    sortingFn: "datetime",
    cell: (info) => <TimeAgo date={info.getValue()} />,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Uploaded" />
    ),
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
  columnHelper.accessor("days", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Date" />,
    cell: (info) => <div className="no-break">{info.row.original.date}</div>,
  }),
  columnHelper.accessor("player_start_tag_name", {
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
  columnHelper.accessor("player_tag_name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Current" />
    ),
    cell: ({ row }) => (
      <Flag tag={row.original.player_tag} name={row.original.player_tag_name} />
    ),
  }),
  columnHelper.accessor("patch", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Patch" />
    ),
  }),
  columnHelper.accessor("game_difficulty", {
    sortingFn: difficultySort,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Difficulty" />
    ),
    cell: (info) => difficultyText(info.getValue()),
  }),
  columnHelper.display({
    id: "Achievements",
    header: "Achievements",
    cell: (info) => (
      <ul className="flex space-x-1">
        {info.row.original.achievements.map((x) => (
          <li className="flex" key={x}>
            <AchievementAvatar id={x} className="h-10 w-10 shrink-0" />
          </li>
        ))}
      </ul>
    ),
  }),
  columnHelper.display({
    id: "actions",
    cell: (info) => (
      <Link href={`/eu4/saves/${info.row.original.id}`}>View</Link>
    ),
  }),
];

export const NewestSavesTable = () => {
  const { data, isFetching, hasNextPage, fetchNextPage, error } =
    pdxApi.saves.useNewest();

  const saves = useMemo(() => data?.pages.flatMap((x) => x.saves), [data]);
  return (
    <div className="flex flex-col space-y-4">
      <Alert.Error className="px-4 py-2" msg={error} />
      <DataTable columns={columns} data={saves ?? []} />
      <Button
        className="self-center"
        disabled={!hasNextPage || isFetching}
        onClick={() => fetchNextPage()}
      >
        Load more
      </Button>
    </div>
  );
};
