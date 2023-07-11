import { Button, Table } from "antd";
import Link from "next/link";
import React from "react";
import { TimeAgo } from "../../../components/TimeAgo";
import { diff } from "../../../lib/dates";
import { difficultyText, difficultyNum } from "../../../lib/difficulty";
import {
  GameDifficulty,
  SaveFile,
  useNewestSavesQuery,
} from "@/services/appApi";
import {
  FlagAvatar,
  AchievementAvatar,
} from "@/features/eu4/components/avatars";

export const NewestSavesTable = () => {
  const { data, isFetching, hasNextPage, fetchNextPage } =
    useNewestSavesQuery();

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
        <Link href={`/users/${x.user_id}`}>{name}</Link>
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
      dataIndex: "player_tag",
      render: (player: string, record: SaveFile) => (
        <FlagAvatar
          tag={record.player_tag}
          name={record.player_tag_name}
          size="large"
        />
      ),
      sorter: (a: SaveFile, b: SaveFile) =>
        a.player_tag_name.localeCompare(b.player_tag_name),
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
        <div className="flex space-x-1">
          {achievements.map((x) => (
            <AchievementAvatar id={x} key={x} size="large" />
          ))}
        </div>
      ),
    },
    {
      title: "",
      dataIndex: "id",
      render: (id: string) => {
        return <Link href={`/eu4/saves/${id}`}>View</Link>;
      },
    },
  ];

  return (
    <div className="flex flex-col space-y-4">
      <Table
        size="small"
        pagination={false}
        loading={isFetching}
        rowKey="id"
        dataSource={data?.pages.flatMap((x) => x.saves)}
        columns={columns}
        scroll={{ x: 1000 }}
      />
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
