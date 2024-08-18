import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { TimeAgo } from "@/components/TimeAgo";
import { Button } from "@/components/Button";
import { difficultyText, difficultySort } from "@/lib/difficulty";
import { pdxApi } from "@/services/appApi";
import { Flag } from "@/features/eu4/components/avatars";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { Link } from "@/components/Link";
import { Alert } from "@/components/Alert";
import { AchievementsCell } from "./AchievementsCell";
import { NewestSaveResponse } from "app/api/new/route";

type SaveFile = NewestSaveResponse["saves"][number];
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
  columnHelper.accessor("date", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Date" />,
    cell: (info) => <div className="no-break">{info.getValue()}</div>,
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
      <AchievementsCell achievements={info.row.original.achievements} />
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

  const endRef = useRef<HTMLDivElement>(null);
  const hasNextPageRef = useRef(hasNextPage);
  useEffect(() => {
    hasNextPageRef.current = hasNextPage;
  }, [hasNextPage]);

  const fetchNextPageRef = useRef(fetchNextPage);
  useEffect(() => {
    fetchNextPageRef.current = fetchNextPage;
  }, [fetchNextPage]);

  useEffect(() => {
    const elem = endRef.current;
    if (!elem) {
      return;
    }

    const observer = new IntersectionObserver(
      (ent) => {
        // When isFetching changes, we want the effect to rerun to trigger
        // another intersection.
        if (ent[0].isIntersecting && hasNextPageRef.current && !isFetching) {
          fetchNextPageRef.current();
        }
      },
      {
        rootMargin: "100px",
        threshold: 0,
      },
    );

    observer.observe(elem);
    return () => {
      observer.disconnect();
    };
  }, [isFetching]);

  return (
    <div className="flex flex-col space-y-4">
      <Alert.Error className="px-4 py-2" msg={error} />
      <DataTable columns={columns} data={saves ?? []} />
      <div ref={endRef} />
    </div>
  );
};
