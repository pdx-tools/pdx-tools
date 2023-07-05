import React, { useCallback, useEffect, useRef } from "react";
import { Switch, Table } from "antd";
import { ColumnProps } from "antd/lib/table";
import {
  useIsLoading,
  useVisualizationDispatch,
} from "@/components/viz/visualization-context";
import { CountryExpenses } from "@/features/eu4/types/models";
import { expenseLedgerAliases } from "../country-details/data";
import { countryColumnFilter } from "./countryColumnFilter";
import { formatFloat, formatInt } from "@/lib/format";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { FlagAvatar } from "@/features/eu4/components/avatars";
import { createCsv } from "@/lib/csv";
import { useTablePagination } from "@/features/ui-controls";
import {
  useEu4Actions,
  useShowOnetimeLineItems,
  useTagFilter,
  useValueFormatPreference,
} from "../../store";

type CountryExpensesRecord = CountryExpenses;

type BaseTableProps = {
  monthlyExpenses: boolean;
};

const mapping = expenseLedgerAliases();

export const CountriesExpensesBaseTable = ({
  monthlyExpenses,
}: BaseTableProps) => {
  const { setShowOneTimeLineItems, setPrefersPercents } = useEu4Actions();
  const isLoading = useIsLoading();
  const doShowPercent = useValueFormatPreference() === "percent";
  const showRecurringOnly = !useShowOnetimeLineItems();
  const countryFilter = useTagFilter();
  const selectFilterRef = useRef(null);
  const visualizationDispatch = useVisualizationDispatch();
  const tablePagination = useTablePagination();

  const { data = [] } = useAnalysisWorker(
    useCallback(
      (worker) =>
        monthlyExpenses
          ? worker.eu4GetCountriesExpenses(
              countryFilter,
              doShowPercent,
              showRecurringOnly
            )
          : worker.eu4GetCountriesTotalExpenses(
              countryFilter,
              doShowPercent,
              showRecurringOnly
            ),
      [countryFilter, doShowPercent, showRecurringOnly, monthlyExpenses]
    )
  );

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
    <div className="flex flex-col space-y-6">
      <div className="flex items-center space-x-8">
        <div className="flex items-center space-x-2">
          <span>Show as percentages:</span>

          <Switch checked={doShowPercent} onChange={setPrefersPercents} />
        </div>

        <div className="flex items-center space-x-2">
          <span>Recurring expenses only:</span>
          <Switch
            checked={showRecurringOnly}
            onChange={(checked: boolean) => setShowOneTimeLineItems(!checked)}
          />
        </div>
      </div>
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
