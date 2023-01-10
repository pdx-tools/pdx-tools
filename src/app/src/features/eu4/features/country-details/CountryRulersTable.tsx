import { Table } from "antd";
import { ColumnGroupType, ColumnType } from "antd/lib/table";
import { PlusCircleTwoTone, MinusCircleTwoTone } from "@ant-design/icons";
import { FailedHeir, LocalizedObj, RunningMonarch } from "../../types/models";
import { formatFloat, formatInt } from "@/lib/format";
import {
  FlagAvatar,
  PersonalityAvatar,
} from "@/features/eu4/components/avatars";

interface CountryRulersTableProps {
  rulers: RunningMonarch[];
}

export const CountryRulersTable = ({ rulers }: CountryRulersTableProps) => {
  const columns: (
    | ColumnGroupType<RunningMonarch>
    | ColumnType<RunningMonarch>
  )[] = [
    {
      title: "Name",
      dataIndex: "name",
    },
    {
      title: "Start",
      dataIndex: "start",
      className: "no-break",
    },
    {
      title: "End",
      dataIndex: "end",
      className: "no-break",
      render: (end) => end ?? "---",
    },
    {
      title: "Reign (months)",
      dataIndex: "reign",
      align: "right",
      render: (reign: number) => formatInt(reign),
    },
    {
      title: "Tag",
      dataIndex: "country",
      render: (country: RunningMonarch["country"]) => (
        <FlagAvatar
          name={country.name}
          tag={country.tag}
          condensed={true}
          size="default"
        />
      ),
    },
    {
      title: "Personalities",
      dataIndex: "personalities",
      render: (personalities: LocalizedObj[]) => (
        <div className="flex items-center">
          {personalities.map((personality) => (
            <PersonalityAvatar key={personality.id} {...personality} />
          ))}
        </div>
      ),
    },
    {
      title: "Stats",
      children: [
        {
          title: "ADM",
          dataIndex: "adm",
          align: "right",
        },
        {
          title: "DIP",
          dataIndex: "dip",
          align: "right",
        },
        {
          title: "MIL",
          dataIndex: "mil",
          align: "right",
        },
        {
          title: "Total",
          dataIndex: "adm",
          key: "total",
          align: "right",
          render: (_x, monarch) => monarch.adm + monarch.dip + monarch.mil,
          className: "antd-column-separator",
        },
      ],
    },
    {
      title: "Running Average Stats",
      children: [
        {
          title: "ADM",
          dataIndex: "avg_adm",
          render: (x: number) => formatFloat(x, 2),
          align: "right",
        },
        {
          title: "DIP",
          dataIndex: "avg_dip",
          render: (x: number) => formatFloat(x, 2),
          align: "right",
        },
        {
          title: "MIL",
          dataIndex: "avg_mil",
          render: (x: number) => formatFloat(x, 2),
          align: "right",
        },
        {
          title: "Total",
          dataIndex: "avg_adm",
          key: "total-average",
          render: (_x, monarch) =>
            formatFloat(monarch.avg_adm + monarch.avg_dip + monarch.avg_mil, 2),
          className: "antd-column-separator",
          align: "right",
        },
      ],
    },
    {
      title: "Reign Weighted Running Average Stats",
      children: [
        {
          title: "ADM",
          dataIndex: "avg_dur_adm",
          render: (x: number) => formatFloat(x, 2),
          align: "right",
        },
        {
          title: "DIP",
          dataIndex: "avg_dur_dip",
          render: (x: number) => formatFloat(x, 2),
          align: "right",
        },
        {
          title: "MIL",
          dataIndex: "avg_dur_mil",
          render: (x: number) => formatFloat(x, 2),
          align: "right",
        },
        {
          title: "Total",
          dataIndex: "avg_dur_adm",
          key: "total-reign-average",
          render: (_x, monarch) =>
            formatFloat(
              monarch.avg_dur_adm + monarch.avg_dur_dip + monarch.avg_dur_mil,
              2
            ),
          align: "right",
        },
      ],
    },
  ];

  const heirColumns: ColumnType<FailedHeir>[] = [
    {
      title: "Name",
      dataIndex: "name",
    },
    {
      title: "Birth",
      dataIndex: "birth",
      className: "no-break",
    },
    {
      title: "Tag",
      dataIndex: "country",
      render: (country: FailedHeir["country"]) => (
        <FlagAvatar
          name={country.name}
          tag={country.tag}
          condensed={true}
          size="small"
        />
      ),
    },
    {
      title: "Personalities",
      dataIndex: "personalities",
      render: (personalities: LocalizedObj[]) =>
        personalities.map((personality) => (
          <PersonalityAvatar key={personality.id} {...personality} />
        )),
    },
    {
      title: "ADM",
      dataIndex: "adm",
      align: "right",
    },
    {
      title: "DIP",
      dataIndex: "dip",
      align: "right",
    },
    {
      title: "MIL",
      dataIndex: "mil",
      align: "right",
    },
    {
      title: "Total",
      dataIndex: "adm",
      key: "total",
      align: "right",
      render: (_x, monarch) => monarch.adm + monarch.dip + monarch.mil,
    },
  ];

  return (
    <Table
      size="small"
      rowKey={(record) => `${record.name}-${record.start}`}
      dataSource={rulers}
      scroll={{ x: true }}
      pagination={false}
      columns={columns}
      title={() =>
        "Running totals are not accurate for election governments. Expand row for failed heirs"
      }
      expandable={{
        rowExpandable: (record) => record.failed_heirs.length > 0,
        expandIcon: ({ expanded, onExpand, record }) =>
          expanded ? (
            <MinusCircleTwoTone onClick={(e) => onExpand(record, e)} />
          ) : record.failed_heirs.length > 0 ? (
            <PlusCircleTwoTone onClick={(e) => onExpand(record, e)} />
          ) : undefined,
        expandedRowRender: (record: RunningMonarch) => (
          <Table
            size="small"
            rowKey={(record) => `${record.name}-${record.birth}`}
            dataSource={record.failed_heirs}
            pagination={false}
            columns={heirColumns}
            title={() =>
              "Heirs that did not take the throne (eg: disinherit / hunting accident)"
            }
          />
        ),
      }}
    />
  );
};
