import React from "react";
import { Table, Space, Typography, Grid } from "antd";
import Link from "next/link";
import {
  difficultyColor,
  difficultyComparator,
  difficultyText,
} from "@/lib/difficulty";
import {
  AchievementDifficulty,
  SaveFile,
  Achievement,
} from "@/services/appApi";
import { AchievementAvatar } from "@/features/eu4/components/avatars";

const { Text } = Typography;
const { useBreakpoint } = Grid;

export type AchievementUploads = Achievement & {
  uploads: number;
};

interface TableEntry {
  achievement: AchievementUploads;
  topSave?: SaveFile;
}

interface AchievementsTableProps {
  achievements: TableEntry[];
}

export const AchievementsTable: React.FC<AchievementsTableProps> = ({
  achievements,
}) => {
  const { md } = useBreakpoint();

  const columns = [
    {
      title: "Name",
      dataIndex: ["achievement", "name"],
      sorter: (a: TableEntry, b: TableEntry) =>
        a.achievement.name.localeCompare(b.achievement.name),
      render: (name: string, record: TableEntry) => (
        <Space>
          <AchievementAvatar size={64} id={record.achievement.id} />
          <Space direction="vertical">
            <Text strong={true}>
              <Link href={`/eu4/achievements/${record.achievement.id}`}>
                <a>{name}</a>
              </Link>
            </Text>
            {md && <Text>{record.achievement.description}</Text>}
          </Space>
        </Space>
      ),
    },
    {
      title: "Difficulty",
      dataIndex: ["achievement", "difficulty"],
      width: 120,
      sorter: (a: TableEntry, b: TableEntry) =>
        difficultyComparator(a.achievement, b.achievement),
      render: (difficulty: AchievementDifficulty) => {
        return {
          props: {
            style: {
              backgroundColor: difficultyColor(difficulty),
            },
          },
          children: difficultyText(difficulty),
        };
      },
    },
    {
      title: "Uploads",
      dataIndex: ["achievement", "uploads"],
      width: 120,
      sorter: (a: TableEntry, b: TableEntry) =>
        a.achievement.uploads - b.achievement.uploads,
    },
    {
      title: "Record",
      dataIndex: ["topSave", "date"],
      className: "no-break",
      width: 120,
      render: (date: SaveFile["date"] | undefined) =>
        date === null || date === undefined ? "---" : date,
      sorter: (a: TableEntry, b: TableEntry) => {
        const aScore = a.topSave?.weighted_score?.days;
        const bScore = b.topSave?.weighted_score?.days;
        if (aScore === null || aScore === undefined) {
          return -1;
        } else if (bScore === null || bScore === undefined) {
          return 1;
        } else {
          return aScore - bScore;
        }
      },
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
