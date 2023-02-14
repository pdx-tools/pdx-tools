import React from "react";
import { Table } from "antd";
import Link from "next/link";
import {
  difficultyColor,
  difficultyComparator,
  difficultyText,
} from "@/lib/difficulty";
import { AchievementDifficulty, Achievement } from "@/services/appApi";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { useBreakpoint } from "@/hooks/useBreakpoint";

interface TableEntry {
  achievement: Achievement;
}

interface AchievementsTableProps {
  achievements: TableEntry[];
}

export const AchievementsTable = ({ achievements }: AchievementsTableProps) => {
  const isMd = useBreakpoint("md");

  const columns = [
    {
      title: "Name",
      dataIndex: ["achievement", "name"],
      sorter: (a: TableEntry, b: TableEntry) =>
        a.achievement.name.localeCompare(b.achievement.name),
      render: (name: string, record: TableEntry) => (
        <div className="flex items-center space-x-2">
          <AchievementAvatar size={64} id={record.achievement.id} />
          <div className="flex flex-col space-y-2">
            <span className="font-bold">
              <Link href={`/eu4/achievements/${record.achievement.id}`}>
                {name}
              </Link>
            </span>
            {isMd && <span>{record.achievement.description}</span>}
          </div>
        </div>
      ),
    },
    {
      title: "Difficulty",
      dataIndex: ["achievement", "difficulty"],
      width: 120,
      sorter: (a: TableEntry, b: TableEntry) =>
        difficultyComparator(a.achievement, b.achievement),
      onCell: (record: TableEntry) => ({
        className: difficultyColor(record.achievement.difficulty),
      }),
      render: (difficulty: AchievementDifficulty) => difficultyText(difficulty),
    },
  ];

  return (
    <Table
      rowKey={(record) => record.achievement.id}
      pagination={false}
      dataSource={achievements}
      columns={columns}
    />
  );
};
