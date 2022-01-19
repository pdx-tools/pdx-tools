import React from "react";
import { Table, Space } from "antd";
import { TimeAgo } from "@/components/TimeAgo";
import { GameDifficulty, SaveFile } from "@/services/appApi";
import { diff } from "@/lib/dates";
import { difficultyNum, difficultyText } from "@/lib/difficulty";
import Link from "next/link";
import { DeleteSave } from "../eu4/components/DeleteSave";
import {
  AchievementAvatar,
  FlagAvatar,
} from "@/features/eu4/components/avatars";

interface UserSaveTableProps {
  records: SaveFile[];
  isPrivileged: boolean;
}

export const UserSaveTable: React.FC<UserSaveTableProps> = ({
  records,
  isPrivileged,
}) => {
  const columns = [
    {
      title: "Uploaded",
      dataIndex: "upload_time",
      render: (upload: string) => <TimeAgo date={upload} />,
      sorter: (a: SaveFile, b: SaveFile) => diff(a.upload_time, b.upload_time),
    },
    {
      title: "Filename",
      dataIndex: "filename",
      sorter: (a: SaveFile, b: SaveFile) =>
        a.filename.localeCompare(b.filename),
    },
    {
      title: "Date",
      dataIndex: "date",
      className: "no-break",
      sorter: (a: SaveFile, b: SaveFile) => a.days - b.days,
    },
    {
      title: "Starting",
      dataIndex: "player_start_tag_name",
      render: (start_tag_name: string, record: SaveFile) =>
        record.player_start_tag && record.player_start_tag_name ? (
          <FlagAvatar
            tag={record.player_start_tag}
            name={record.player_start_tag_name}
            size="large"
          />
        ) : (
          "Multiplayer"
        ),
      sorter: (a: SaveFile, b: SaveFile) =>
        (a.player_start_tag_name || "").localeCompare(
          b.player_start_tag_name || ""
        ),
    },
    {
      title: "Current",
      dataIndex: "player",
      render: (player: string, record: SaveFile) => (
        <FlagAvatar
          tag={record.player}
          name={record.displayed_country_name}
          size="large"
        />
      ),
      sorter: (a: SaveFile, b: SaveFile) =>
        a.displayed_country_name.localeCompare(b.displayed_country_name),
    },
    {
      title: "Patch",
      dataIndex: "patch",
      sorter: (a: SaveFile, b: SaveFile) => a.patch.localeCompare(b.patch),
    },
    {
      title: "Difficulty",
      dataIndex: "game_difficulty",
      render: (difficulty: GameDifficulty) => difficultyText(difficulty),
      sorter: (a: SaveFile, b: SaveFile) =>
        difficultyNum(a.game_difficulty) - difficultyNum(b.game_difficulty),
    },
    {
      title: "Achievements",
      dataIndex: "achievements",
      render: (achievements: string[]) => (
        <Space size="small">
          {achievements.map((x) => (
            <AchievementAvatar id={x} key={x} size="large" />
          ))}
        </Space>
      ),
    },
    {
      title: "",
      dataIndex: "id",
      render: (id: string) => {
        const link = (
          <Link href={`/eu4/saves/${id}`}>
            <a>View</a>
          </Link>
        );
        let deleteEle = null;
        if (isPrivileged) {
          deleteEle = <DeleteSave saveId={id} type="link" />;
        }

        return (
          <Space>
            {link}
            {deleteEle}
          </Space>
        );
      },
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
