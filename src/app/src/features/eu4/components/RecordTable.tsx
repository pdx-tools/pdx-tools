import React from "react";
import { Table, Tooltip } from "antd";
import { rankDisplay } from "@/lib/ranks";
import Link from "next/link";
import { GameDifficulty } from "@/services/appApi";
import { difficultyNum, difficultyText } from "@/lib/difficulty";
import { FlagAvatar } from "@/features/eu4/components/avatars";
import { TimeAgo } from "@/components/TimeAgo";
import { diff } from "@/lib/dates";
import { RankedSaveFile } from "@/services/appApi";
import { formatInt } from "@/lib/format";

interface RecordTableProps {
  records: RankedSaveFile[];
}

export const RecordTable = ({ records }: RecordTableProps) => {
  const columns = [
    {
      title: "Rank",
      dataIndex: "rank",
      render: (rank: number) => rankDisplay(rank),
      sorter: (a: RankedSaveFile, b: RankedSaveFile) => a.rank - b.rank,
    },
    {
      title: "Player",
      dataIndex: "user_name",
      render: (name: string, x: RankedSaveFile) => (
        <Link href={`/users/${x.user_id}`}>{name}</Link>
      ),
      sorter: (a: RankedSaveFile, b: RankedSaveFile) =>
        a.user_name.localeCompare(b.user_name),
    },
    {
      title: () => (
        <Tooltip title="Saves from older patches are taxed">
          <div>Score</div>
        </Tooltip>
      ),
      dataIndex: "weighted_score",
      showSorterTooltip: false,
      sorter: (a: RankedSaveFile, b: RankedSaveFile) =>
        (a.weighted_score?.days || 0) - (b.weighted_score?.days || 0),
      render: (score: RankedSaveFile["weighted_score"], x: RankedSaveFile) => (
        <Tooltip
          title={`${formatInt(x.days)} @ ${x.patch
            .split(".")
            .slice(0, 2)
            .join(".")} = ${score?.date}`}
        >
          <div>{score?.days ? formatInt(score.days) : "---"}</div>
        </Tooltip>
      ),
    },
    {
      title: "Date",
      dataIndex: "date",
      className: "no-break",
      sorter: (a: RankedSaveFile, b: RankedSaveFile) => a.days - b.days,
      render: (date: string, x: RankedSaveFile) => (
        <Tooltip title={formatInt(x.days)}>
          <div>{date}</div>
        </Tooltip>
      ),
    },
    {
      title: "Difficulty",
      dataIndex: "game_difficulty",
      render: (difficulty: GameDifficulty) => difficultyText(difficulty),
      sorter: (a: RankedSaveFile, b: RankedSaveFile) =>
        difficultyNum(a.game_difficulty) - difficultyNum(b.game_difficulty),
    },
    {
      title: "Starting",
      dataIndex: "player_start_tag_name",
      render: (start_tag_name: string, record: RankedSaveFile) => (
        <FlagAvatar
          tag={record.player_start_tag!}
          name={record.player_start_tag_name!}
          size="large"
        />
      ),
      sorter: (a: RankedSaveFile, b: RankedSaveFile) =>
        a.player_start_tag_name!.localeCompare(b.player_start_tag_name!),
    },
    {
      title: "Current",
      dataIndex: "player",
      render: (player: string, record: RankedSaveFile) => (
        <FlagAvatar
          tag={record.player}
          name={record.displayed_country_name}
          size="large"
        />
      ),
      sorter: (a: RankedSaveFile, b: RankedSaveFile) =>
        a.displayed_country_name.localeCompare(b.displayed_country_name),
    },
    {
      title: "Patch",
      dataIndex: "patch",
      sorter: (a: RankedSaveFile, b: RankedSaveFile) =>
        a.patch.localeCompare(b.patch),
    },
    {
      title: "Uploaded",
      dataIndex: "upload_time",
      render: (upload: string) => <TimeAgo date={upload} />,
      sorter: (a: RankedSaveFile, b: RankedSaveFile) =>
        diff(a.upload_time, b.upload_time),
    },
    {
      title: "",
      dataIndex: "id",
      render: (id: string) => <Link href={`/eu4/saves/${id}`}>View</Link>,
    },
  ];

  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      dataSource={records}
      columns={columns}
      scroll={{ x: 1000 }}
    />
  );
};
