import { useWorkerOnSave, WorkerClient } from "@/features/engine";
import { useTablePagination } from "@/features/ui-controls";
import { formatFloat, formatInt } from "@/lib/format";
import { Tooltip } from "antd";
import Table, { ColumnType } from "antd/lib/table";
import {
  StarOutlined,
  CaretUpFilled,
  CaretDownFilled,
  MinusOutlined,
} from "@ant-design/icons";
import React, { useCallback, useState } from "react";
import { CountryDetails, CountryStateDetails } from "../../types/models";

export interface CountryStatesProps {
  details: CountryDetails;
}

const CountryStateDetails = ({ data }: { data: CountryStateDetails[] }) => {
  const tablePagination = useTablePagination();

  const columns: ColumnType<CountryStateDetails>[] = [
    {
      title: "State",
      dataIndex: ["state", "name"],
      render: (_name: string, x: CountryStateDetails) => (
        <div className="flex items-center gap-2">
          <Tooltip title={x.state.id}>{x.state.name}</Tooltip>
          {x.capital_state && (
            <Tooltip title="is capital state">
              <StarOutlined />
            </Tooltip>
          )}
        </div>
      ),
      sorter: (a: CountryStateDetails, b: CountryStateDetails) =>
        a.state.name.localeCompare(b.state.name),
    },
    {
      title: "Dev.",
      dataIndex: "total_dev",
      align: "right",
      sorter: (a: CountryStateDetails, b: CountryStateDetails) =>
        a.total_dev - b.total_dev,
      render: (x: number) => `${formatInt(x)}`,
    },
    {
      title: "Gov. Cost",
      dataIndex: "total_gc",
      align: "right",
      sorter: (a: CountryStateDetails, b: CountryStateDetails) =>
        a.total_gc - b.total_gc,
      render: (x: number) => `${formatFloat(x, 2)}`,
    },
    {
      title: "Centralizing",
      dataIndex: "centralizing",
      align: "right",
      sorter: (a: CountryStateDetails, b: CountryStateDetails) => {
        if (a.centralizing === null) {
          return 1;
        } else if (b.centralizing === null) {
          return -1;
        } else {
          return a.centralizing.progress - b.centralizing.progress;
        }
      },
      render: (x) =>
        x == null ? (
          "---"
        ) : (
          <Tooltip title={x.date}>
            <span>{formatFloat(x.progress * 100, 2)}%</span>
          </Tooltip>
        ),
    },
    {
      title: "Centralized",
      dataIndex: "centralized",
      align: "right",
      sorter: (a: CountryStateDetails, b: CountryStateDetails) =>
        a.centralized - b.centralized,
      render: (x: number) => `${formatInt(x)}`,
    },
    {
      title: "State House",
      dataIndex: "state_house",
      align: "right",
      sorter: (a: CountryStateDetails, b: CountryStateDetails) =>
        +a.state_house - +b.state_house,
      render: (x: boolean) => (x ? "✔️" : ""),
    },
    {
      title: "Prosperity",
      dataIndex: "prosperity",
      align: "right",
      sorter: (a: CountryStateDetails, b: CountryStateDetails) =>
        a.prosperity - b.prosperity,
      render: (_: number, x: CountryStateDetails) => (
        <div className="flex items-center gap-2">
          <span className="grow">{formatInt(x.prosperity)}</span>
          {x.prosperity_mode === true && <CaretUpFilled />}
          {x.prosperity_mode === false && <CaretDownFilled />}
          {x.prosperity_mode === null && <MinusOutlined />}
        </div>
      ),
    },
  ];

  return (
    <Table
      size="small"
      pagination={tablePagination}
      rowKey={(x) => x.state.id}
      dataSource={data}
      columns={columns}
    />
  );
};

const CountryStateImpl = React.memo(CountryStateDetails);

export const CountryStates = ({ details }: CountryStatesProps) => {
  const [data, setData] = useState<CountryStateDetails[]>([]);
  const cb = useCallback(
    async (worker: WorkerClient) => {
      const result = await worker.eu4GetCountryStates(details.tag);
      setData(result);
    },
    [details.tag]
  );

  useWorkerOnSave(cb);

  return <CountryStateImpl data={data} />;
};
