import { useEu4Worker } from "@/features/eu4/worker";
import { useTablePagination } from "@/features/ui-controls";
import Table, { ColumnGroupType, ColumnType } from "antd/lib/table";
import { useCallback } from "react";
import { CountryDetails, CountryLeader } from "../../types/models";
import { Badge } from "@/components/Badge";

export interface CountryLeadersProps {
  details: CountryDetails;
}

export const CountryLeaders = ({ details }: CountryLeadersProps) => {
  const tablePagination = useTablePagination();
  const { data = [] } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetCountryLeaders(details.tag),
      [details.tag]
    )
  );

  const columns: (
    | ColumnGroupType<CountryLeader>
    | ColumnType<CountryLeader>
  )[] = [
    {
      title: "Name",
      dataIndex: "name",
      render: (_: any, x: CountryLeader) =>
        `${x.name}${
          x.monarch_stats
            ? ` (${x.monarch_stats.adm} / ${x.monarch_stats.dip} / ${x.monarch_stats.mil})`
            : ""
        }`,
      sorter: (a: CountryLeader, b: CountryLeader) =>
        a.name.localeCompare(b.name),
    },
    {
      title: "Tags",
      render: (_: any, x: CountryLeader) => (
        <>
          {x.active && <Badge variant="green">ACTIVE</Badge>}
          {(x.kind == "Admiral" || x.kind == "Explorer") && (
            <Badge variant="blue">{x.kind.toUpperCase()}</Badge>
          )}
          {(x.kind == "General" || x.kind == "Conquistador") && (
            <Badge variant="default">{x.kind.toUpperCase()}</Badge>
          )}
          {!!x.monarch_stats && <Badge variant="gold">RULER</Badge>}
        </>
      ),
      filters: [
        { text: "Admiral", value: "Admiral" },
        { text: "Conquistador", value: "Conquistador" },
        { text: "Explorer", value: "Explorer" },
        { text: "General", value: "General" },
        { text: "Active", value: "Active" },
        { text: "Rulers", value: "Rulers" },
      ],
      onFilter: (value, record) => {
        switch (value) {
          case "Admiral":
          case "Conquistador":
          case "Explorer":
          case "General":
            return record.kind == value;

          case "Active":
            return record.active;

          case "Rulers":
            return !!record.monarch_stats;

          default:
            return true;
        }
      },
    },
    {
      title: "Activation",
      dataIndex: "activation",
      sorter: (a: CountryLeader, b: CountryLeader) =>
        (a.activation ?? "").localeCompare(b.activation ?? ""),
    },
    {
      title: "Fire",
      dataIndex: "fire",
      sorter: (a: CountryLeader, b: CountryLeader) => a.fire - b.fire,
    },
    {
      title: "Shock",
      dataIndex: "shock",
      sorter: (a: CountryLeader, b: CountryLeader) => a.shock - b.shock,
    },
    {
      title: "Manuever",
      dataIndex: "manuever",
      sorter: (a: CountryLeader, b: CountryLeader) => a.manuever - b.manuever,
    },
    {
      title: "Siege",
      dataIndex: "siege",
      sorter: (a: CountryLeader, b: CountryLeader) => a.siege - b.siege,
    },
    {
      title: "Total",
      render: (_: any, x: CountryLeader) =>
        x.fire + x.shock + x.manuever + x.siege,
      sorter: (a: CountryLeader, b: CountryLeader) =>
        a.fire +
        a.shock +
        a.manuever +
        a.siege -
        (b.fire + b.shock + b.manuever + b.siege),
    },
  ];

  return (
    <Table
      size="small"
      rowKey={(record) => `${record.id}`}
      dataSource={data}
      scroll={{ x: true }}
      columns={columns}
      pagination={tablePagination}
      title={() => "Leaders"}
    />
  );
};
