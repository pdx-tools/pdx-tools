import React, { useCallback, useState } from "react";
import { Table, Tooltip } from "antd";
import { ColumnType, ColumnGroupType } from "antd/lib/table";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails, CountryCulture } from "../../types/models";
import {
  useWorkerOnSave,
  WorkerClient,
} from "../../../engine/worker/wasm-worker-context";
import { StarTwoTone } from "@ant-design/icons";
import { useBreakpoint } from "@/hooks/useBreakpoint";

export interface CountryCulturesProps {
  details: CountryDetails;
}

export interface CountryCultureVizProps {
  data: CountryCulture[];
  largeLayout: boolean;
}

const CultureStar = ({
  tolerance,
}: {
  tolerance: CountryCulture["tolerance"];
}) => {
  switch (tolerance) {
    case "Primary":
      return <StarTwoTone twoToneColor="#FFDE4C" />;
    case "Accepted":
      return <StarTwoTone twoToneColor="#BABABA" />;
    case "None":
      return null;
  }
};

const CountryCultureVizImpl = ({
  data,
  largeLayout,
}: CountryCultureVizProps) => {
  const columns: (
    | ColumnType<CountryCulture>
    | ColumnGroupType<CountryCulture>
  )[] = [
    {
      title: "Culture",
      dataIndex: "name",
      render: (_name: string, x: CountryCulture) => (
        <Tooltip
          title={`${x.id}${x.tolerance !== "None" ? ` (${x.tolerance})` : ""}`}
        >
          <CultureStar tolerance={x.tolerance} /> {x.name}
        </Tooltip>
      ),
      sorter: (a: CountryCulture, b: CountryCulture) =>
        a.name.localeCompare(b.name),
    },
    {
      title: "Group",
      dataIndex: "group",
      sorter: (a: CountryCulture, b: CountryCulture) =>
        (a.group ?? "---").localeCompare(b.group ?? "---"),
    },
    {
      title: "Provinces",
      children: [
        {
          title: "Count",
          dataIndex: "provinces",
          align: "right",
          sorter: (a: CountryCulture, b: CountryCulture) =>
            a.provinces - b.provinces,
          render: (_: number, x) =>
            `${formatInt(x.provinces)} (${formatFloat(
              x.provinces_percent,
              2
            )}%)`,
        },
        {
          title: "Dev",
          dataIndex: "development",
          align: "right",
          sorter: (a: CountryCulture, b: CountryCulture) =>
            a.development - b.development,
          render: (_: number, x) =>
            `${formatInt(x.development)} (${formatFloat(
              x.development_percent,
              2
            )}%)`,
        },
      ],
    },
    {
      title: "Stated Provinces",
      children: [
        {
          title: "Count",
          dataIndex: "stated_provs",
          align: "right",
          sorter: (a: CountryCulture, b: CountryCulture) =>
            a.stated_provs - b.stated_provs,
          render: (_: number, x) =>
            `${formatInt(x.stated_provs)} (${formatFloat(
              x.stated_provs_percent,
              2
            )}%)`,
        },
        {
          title: "Dev",
          dataIndex: "stated_provs_development",
          defaultSortOrder: "descend",
          align: "right",
          sorter: (a: CountryCulture, b: CountryCulture) =>
            a.stated_provs_development - b.stated_provs_development,
          render: (_: number, x) =>
            `${formatInt(x.stated_provs_development)} (${formatFloat(
              x.stated_provs_development_percent,
              2
            )}%)`,
        },
      ],
    },
    {
      title: "Ongoing Conversions",
      children: [
        {
          title: "Count",
          dataIndex: "conversions",
          align: "right",
          sorter: (a: CountryCulture, b: CountryCulture) =>
            a.conversions - b.conversions,
          render: (_: number, x) => formatInt(x.conversions),
        },
        {
          title: "Dev",
          dataIndex: "conversions_development",
          align: "right",
          sorter: (a: CountryCulture, b: CountryCulture) =>
            a.conversions_development - b.conversions_development,
          render: (_: number, x) => formatInt(x.conversions_development),
        },
      ],
    },
  ];

  return (
    <Table
      size="small"
      rowKey={(record) => `${record.id}`}
      dataSource={data}
      scroll={{ x: true }}
      pagination={false}
      columns={columns}
    />
  );
};

const CountryCultureViz = React.memo(CountryCultureVizImpl);

export const CountryCultures = ({ details }: CountryCulturesProps) => {
  const isMd = useBreakpoint("md");
  const [data, setData] = useState<CountryCulture[]>([]);
  const cb = useCallback(
    async (worker: WorkerClient) => {
      const result = await worker.eu4GetCountryProvinceCulture(details.tag);
      setData(result);
    },
    [details.tag]
  );

  useWorkerOnSave(cb);

  return <CountryCultureViz data={data} largeLayout={isMd} />;
};
