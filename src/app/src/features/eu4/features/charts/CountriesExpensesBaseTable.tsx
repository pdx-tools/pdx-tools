import React, { useCallback, useEffect, useRef, useState } from "react";
import { Divider, Space, Switch, Table, Typography } from "antd";
import { ColumnProps } from "antd/lib/table";
import {
  useIsLoading,
  useVisualizationDispatch,
} from "@/components/viz/visualization-context";
import { CountryExpenses } from "@/features/eu4/types/models";
import { expenseLedgerAliases } from "../country-details/data";
import { countryColumnFilter } from "./countryColumnFilter";
import { formatFloat, formatInt } from "@/lib/format";
import { useSelector } from "react-redux";
import {
  selectOneTimeLineItems,
  selectPrefersPercents,
  setPrefersPercents,
  setShowOneTimeLineItems,
} from "@/features/engine";
import { useAnalysisWorker, WorkerClient } from "@/features/engine";
import { useAppDispatch } from "@/lib/store";
import { FlagAvatar } from "@/features/eu4/components/avatars";
import { selectEu4CountryFilter } from "@/features/eu4/eu4Slice";
import { createCsv } from "@/lib/csv";
import { useTablePagination } from "@/features/ui-controls";
const { Text } = Typography;

type CountryExpensesRecord = CountryExpenses;

interface BaseTableProps {
  monthlyExpenses: boolean;
}

const mapping = expenseLedgerAliases();

export const CountriesExpensesBaseTable = ({
  monthlyExpenses,
}: BaseTableProps) => {
  const dispatch = useAppDispatch();
  const isLoading = useIsLoading();
  const [data, setData] = useState<CountryExpensesRecord[]>([]);
  const doShowPercent = useSelector(selectPrefersPercents);
  const showRecurringOnly = !useSelector(selectOneTimeLineItems);
  const countryFilter = useSelector(selectEu4CountryFilter);
  const selectFilterRef = useRef(null);
  const visualizationDispatch = useVisualizationDispatch();
  const tablePagination = useTablePagination();

  const cb = useCallback(
    async (worker: WorkerClient) => {
      const result = monthlyExpenses
        ? await worker.eu4GetCountriesExpenses(
            countryFilter,
            doShowPercent,
            showRecurringOnly
          )
        : await worker.eu4GetCountriesTotalExpenses(
            countryFilter,
            doShowPercent,
            showRecurringOnly
          );
      setData(result);
    },
    [countryFilter, doShowPercent, showRecurringOnly, monthlyExpenses]
  );
  useAnalysisWorker(cb);

  const title = monthlyExpenses
    ? "Country Expenses Table"
    : "Country Total Expenses Table";

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const keys: (keyof CountryExpensesRecord)[] = [
          "tag",
          "name",
          ...mapping.map(([key, _]) => key),
        ];

        return createCsv(data, keys);
      },
    });
  }, [data, visualizationDispatch]);

  const numRenderer = doShowPercent
    ? (x: number) => `${x}%`
    : monthlyExpenses
    ? (x: number) => formatFloat(x, 2)
    : (x: number) => formatInt(x);

  const dataColumns: ColumnProps<CountryExpensesRecord>[] = mapping.map(
    ([key, text]) => ({
      title: text,
      dataIndex: key,
      render: numRenderer,
      align: "right",
      width: 25 + text.length * 8,
      sorter: (a: any, b: any) => a[key] - b[key],
    })
  );

  const columns: ColumnProps<CountryExpensesRecord>[] = [
    {
      title: "Country",
      dataIndex: "name",
      fixed: "left",
      width: 175,
      render: (name: string, x: CountryExpenses) => (
        <FlagAvatar tag={x.tag} name={x.name} size="large" />
      ),
      sorter: (a: CountryExpenses, b: CountryExpenses) =>
        a.name.localeCompare(b.name),
      ...countryColumnFilter(selectFilterRef, (record) => record.tag),
    },
    ...dataColumns,
  ];

  if (!doShowPercent) {
    columns.push({
      title: "Total",
      dataIndex: "total",
      fixed: "right",
      align: "right",
      width: 100,
      render: numRenderer,
      sorter: (a: CountryExpenses, b: CountryExpenses) => a.total - b.total,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Space>
        <Space size="small">
          <Text>Show as percentages:</Text>

          <Switch
            checked={doShowPercent}
            onChange={(checked: boolean) =>
              dispatch(setPrefersPercents(checked))
            }
          />
        </Space>

        <Divider type="vertical" />
        <Space size="small">
          <Text>Recurring expenses only:</Text>
          <Switch
            checked={showRecurringOnly}
            onChange={(checked: boolean) =>
              dispatch(setShowOneTimeLineItems(!checked))
            }
          />
        </Space>
      </Space>
      <Table
        rowKey="name"
        size="small"
        loading={isLoading}
        dataSource={data}
        columns={columns}
        pagination={tablePagination}
        scroll={{ x: true }}
      />
    </div>
  );
};
function visualizationDispatch(arg0: {
  type: string;
  getCsvData: () => Promise<any>;
}) {
  throw new Error("Function not implemented.");
}
