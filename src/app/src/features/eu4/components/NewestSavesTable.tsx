import { Space, Table } from "antd";
import Link from "next/link";
import React from "react";
import { TimeAgo } from "../../../components/TimeAgo";
import { diff } from "../../../lib/dates";
import { difficultyText, difficultyNum } from "../../../lib/difficulty";
import { rakalyApi } from "../../../services/rakalyApi";
import { GameDifficulty, SaveFile } from "@/services/rakalyApi";
import {
  FlagAvatar,
  AchievementAvatar,
} from "@/features/eu4/components/avatars";

export const NewestSavesTable: React.FC<{}> = () => {
  const { data, isFetching } = rakalyApi.endpoints.getNewestSaves.useQuery();

  const columns = [
    {
      title: "Uploaded",
      dataIndex: "upload_time",
      render: (upload: string) => <TimeAgo date={upload} />,
      sorter: (a: SaveFile, b: SaveFile) => diff(a.upload_time, b.upload_time),
    },
    {
      title: "Player",
      dataIndex: "user_name",
      render: (name: string, x: SaveFile) => (
        <Link href={`/users/${x.user_id}`}>
          <a>{name}</a>
        </Link>
      ),
      sorter: (a: SaveFile, b: SaveFile) =>
        a.user_name.localeCompare(b.user_name),
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
            <AchievementAvatar key={x} size="large" id={x} />
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
        return <Space>{link}</Space>;
      },
    },
  ];

  return (
    <Table
      size="small"
      pagination={false}
      loading={isFetching}
      rowKey="id"
      dataSource={data?.saves}
      columns={columns}
      scroll={{ x: 1000 }}
    />
  );
};
