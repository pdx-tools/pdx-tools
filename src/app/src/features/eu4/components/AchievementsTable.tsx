import React, { useMemo } from "react";
import { difficultySort, difficultyText } from "@/lib/difficulty";
import { Achievement } from "@/services/appApi";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { Link } from "@/components/Link";

interface AchievementsTableProps {
  achievements: {
    achievement: Achievement;
  }[];
}

const columnHelper = createColumnHelper<Achievement>();

const columns = [
  columnHelper.accessor("name", {
    cell: (info) => (
      <div className="flex items-center space-x-2">
        <AchievementAvatar
          size={64}
          className="flex-shrink-0"
          id={info.row.original.id}
        />
        <div className="flex flex-col space-y-2">
          <Link
            className="font-bold"
            href={`/eu4/achievements/${info.row.original.id}`}
          >
            {info.row.original.name}
          </Link>
          <span className="hidden md:block">
            {info.row.original.description}
          </span>
        </div>
      </div>
    ),
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Achievement" />
    ),
  }),

  columnHelper.accessor("difficulty", {
    sortingFn: difficultySort,
    cell: (info) => difficultyText(info.getValue()),
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Difficulty" />
    ),
  }),
];

export const AchievementsTable = ({ achievements }: AchievementsTableProps) => {
  const data = useMemo(
    () => achievements.map((x) => x.achievement),
    [achievements],
  );

  return <DataTable columns={columns} data={data} />;
};
