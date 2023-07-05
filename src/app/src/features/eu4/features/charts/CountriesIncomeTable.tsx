import React, { useCallback, useEffect, useRef } from "react";
import { Switch, Table } from "antd";
import { ColumnProps } from "antd/lib/table";
import { incomeLedgerAliases } from "../country-details/data";
import { CountryIncome } from "../../types/models";
import {
  useIsLoading,
  useVisualizationDispatch,
} from "../../../../components/viz/visualization-context";
import { countryColumnFilter } from "./countryColumnFilter";
import { formatFloat } from "@/lib/format";
import { useAnalysisWorker } from "../../worker/useAnalysisWorker";
import { FlagAvatar } from "@/features/eu4/components/avatars";
import { createCsv } from "@/lib/csv";
import { useTablePagination } from "@/features/ui-controls";
import {
  useEu4Actions,
  useShowOnetimeLineItems,
  useTagFilter,
  useValueFormatPreference,
} from "../../store";

type CountryIncomeRecord = CountryIncome;
const aliases = incomeLedgerAliases();

export const CountriesIncomeTable = () => {
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
        worker.eu4GetCountriesIncome(
          countryFilter,
          doShowPercent,
          showRecurringOnly
        ),
      [countryFilter, doShowPercent, showRecurringOnly]
    )
  );

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const keys: (keyof CountryIncomeRecord)[] = [
          "tag",
          "name",
          ...aliases.map(([key, _]) => key),
        ];

        return createCsv(data, keys);
      },
    });
  }, [data, visualizationDispatch]);

  const mapping = aliases;

  const numRenderer = doShowPercent
    ? (x: number) => `${x}%`
    : (x: number) => formatFloat(x, 2);

  const dataColumns: ColumnProps<CountryIncomeRecord>[] = mapping.map(
    ([key, text]) => ({
      title: text,
      dataIndex: key,
      render: numRenderer,
      align: "right",
      width: 25 + text.length * 8,
      sorter: (a: any, b: any) => a[key] - b[key],
    })
  );

  const columns: ColumnProps<CountryIncomeRecord>[] = [
    {
      title: "Country",
      dataIndex: "name",
      fixed: "left",
      width: 175,
      render: (name: string, x: CountryIncome) => (
        <FlagAvatar tag={x.tag} name={x.name} size="large" />
      ),
      sorter: (a: CountryIncome, b: CountryIncome) =>
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
      sorter: (a: CountryIncome, b: CountryIncome) => a.total - b.total,
    });
  }

  return (
    <>
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
          size="small"
          rowKey="name"
          loading={isLoading}
          dataSource={data}
          columns={columns}
          pagination={tablePagination}
          scroll={{ x: true }}
        />
      </div>
    </>
  );
};
