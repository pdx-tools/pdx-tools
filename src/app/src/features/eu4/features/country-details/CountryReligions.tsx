import React, { useCallback, useMemo, useState } from "react";
import { PieConfig } from "@ant-design/charts";
import { Table, Tooltip, Grid } from "antd";
import { ColumnType } from "antd/lib/table";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails, CountryReligion } from "../../types/models";
import {
  useWorkerOnSave,
  WorkerClient,
} from "../../../engine/worker/wasm-worker-context";
import { Pie, LegendColor } from "@/components/viz";

export interface CountryReligionsProps {
  details: CountryDetails;
}

export interface CountryReligionVizProps {
  data: CountryReligion[];
  largeLayout: boolean;
}

const CountryReligionVizImpl: React.FC<CountryReligionVizProps> = ({
  data,
  largeLayout,
}) => {
  const columns: ColumnType<CountryReligion>[] = [
    {
      title: "Religion",
      dataIndex: ["religion", "name"],
      render: (_name: string, x: CountryReligion) => (
        <Tooltip title={x.id}>
          <div className="flex-row gap">
            <LegendColor color={x.color}></LegendColor>
            {x.name}
          </div>
        </Tooltip>
      ),
      sorter: (a: CountryReligion, b: CountryReligion) =>
        a.name.localeCompare(b.name),
    },
    {
      title: "Provinces",
      dataIndex: "provinces",
      align: "right",
      sorter: (a: CountryReligion, b: CountryReligion) =>
        a.provinces - b.provinces,
      render: (_: number, x) =>
        `${formatInt(x.provinces)} (${formatFloat(x.provinces_percent, 2)}%)`,
    },
    {
      title: "Development",
      dataIndex: "development",
      defaultSortOrder: "descend",
      align: "right",
      sorter: (a: CountryReligion, b: CountryReligion) =>
        a.development - b.development,
      render: (_: number, x) =>
        `${formatInt(x.development)} (${formatFloat(
          x.development_percent,
          2
        )}%)`,
    },
  ];

  const palette = useMemo(
    () => new Map(data.map((x) => [x.name, x.color])),
    [data]
  );

  const chartConfig: PieConfig = {
    data,
    angleField: "development",
    colorField: "name",
    autoFit: true,
    innerRadius: 0.5,
    color: (data) => palette.get(data.name) || "#000",
    label: {
      type: "inner",
      offset: "-30%",
      formatter: (_text: any, item: any) =>
        `${item._origin.development.toFixed(0)}`,
    },
    interactions: [{ type: "element-active" }],
    statistic: {
      title: false,
      content: {
        style: {
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "24px",
        },
        formatter: () => "Religion\nDev",
      },
    },
  };

  return (
    <div
      className="flex-row gap"
      style={{ flexDirection: largeLayout ? "row" : "column" }}
    >
      <Table
        size="small"
        rowKey={(record) => `${record.id}`}
        dataSource={data}
        scroll={{ x: true }}
        pagination={false}
        columns={columns}
      />
      <Pie {...chartConfig} />
    </div>
  );
};

const CountryReligionViz = React.memo(CountryReligionVizImpl);

export const CountryReligions: React.FC<CountryReligionsProps> = ({
  details,
}) => {
  const { md } = Grid.useBreakpoint();
  const [data, setData] = useState<CountryReligion[]>([]);
  const cb = useCallback(
    async (worker: WorkerClient) => {
      const result = await worker.eu4GetCountryProvinceReligion(details.tag);
      setData(result);
    },
    [details.tag]
  );

  useWorkerOnSave(cb);

  return <CountryReligionViz data={data} largeLayout={!!md} />;
};
