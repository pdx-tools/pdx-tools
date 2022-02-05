import { useWorkerOnSave, WorkerClient } from "@/features/engine";
import { Tag } from "antd";
import Table, { ColumnGroupType, ColumnType } from "antd/lib/table";
import { useCallback, useState } from "react";
import { CountryDetails, CountryLeader } from "../../types/models";

export interface CountryLeadersProps {
  details: CountryDetails;
}

export const CountryLeaders: React.FC<CountryLeadersProps> = ({ details }) => {
  const [data, setData] = useState<CountryLeader[]>([]);
  const cb = useCallback(
    async (worker: WorkerClient) => {
      const result = await worker.eu4GetCountryLeaders(details.tag);
      setData(result);
    },
    [details.tag]
  );

  useWorkerOnSave(cb);

  const [includeGenerals, setIncludeGenerals] = useState(true);
  const [includeAdmirals, setIncludeAdmirals] = useState(true);
  const [includeExplorers, setIncludeExplorers] = useState(true);
  const [includeConquistadors, setIncludeConquistadors] = useState(true);
  const [includeUnactive, setIncludeUnactive] = useState(true);
  const [includeOnlyRulers, setIncludeOnlyRulers] = useState(false);

  const columns: (
    | ColumnGroupType<CountryLeader>
    | ColumnType<CountryLeader>
  )[] = [
    {
      title: "Name",
      dataIndex: "name",
      render: (_: any, x: CountryLeader) =>
        `${x.name}${
          x.monarch_stats &&
          ` (${x.monarch_stats.adm} / ${x.monarch_stats.dip} / ${x.monarch_stats.mil})`
        }`,
      sorter: (a: CountryLeader, b: CountryLeader) =>
        a.name.localeCompare(b.name),
    },
    {
      title: "Tags",
      render: (_: any, x: CountryLeader) => (
        <>
          {x.active && <Tag color="green">ACTIVE</Tag>}
          {(x.kind == "Admiral" || x.kind == "Explorer") && (
            <Tag color="geekblue">{x.kind.toUpperCase()}</Tag>
          )}
          {(x.kind == "General" || x.kind == "Conquistador") && (
            <Tag color="default">{x.kind.toUpperCase()}</Tag>
          )}
          {!!x.monarch_stats && <Tag color="gold">RULER</Tag>}
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
      title={() => "Leaders"}
    />
  );
};
