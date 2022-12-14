import React from "react";
import { Table } from "antd";
import type { SkanSave } from "./skanTypes";
import { TimeAgo } from "@/components/TimeAgo";
import Link from "next/link";

interface SkanUserSavesProp {
  records: SkanSave[];
  loading: boolean;
}

export const SkanUserSavesTable = ({ records, loading }: SkanUserSavesProp) => {
  const columns = [
    {
      title: "Uploaded",
      dataIndex: "timestamp",
      render: (timestamp: string) => <TimeAgo date={timestamp} />,
      sorter: (a: SkanSave, b: SkanSave) =>
        a.timestamp_epoch - b.timestamp_epoch,
    },
    {
      title: "Name",
      dataIndex: "name",
      sorter: (a: SkanSave, b: SkanSave) => a.name.localeCompare(b.name),
    },
    {
      title: "Date",
      dataIndex: "date",
      className: "no-break",
    },
    {
      title: "Player",
      dataIndex: "player",
      sorter: (a: SkanSave, b: SkanSave) => a.player.localeCompare(b.player),
    },
    {
      title: "Patch",
      dataIndex: "version",
      sorter: (a: SkanSave, b: SkanSave) => a.version.localeCompare(b.version),
    },
    {
      title: "",
      dataIndex: "hash",
      render: (hash: string) => {
        return <Link href={`/eu4/skanderbeg/${hash}`}>View</Link>;
      },
    },
  ];

  return (
    <Table
      title={() => "Your Skanderbeg Saves"}
      size="small"
      rowKey="hash"
      loading={loading}
      dataSource={records}
      columns={columns}
    />
  );
};
