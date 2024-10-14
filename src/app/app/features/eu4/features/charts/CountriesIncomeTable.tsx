import React, { useCallback, useEffect, useMemo } from "react";
import { incomeLedgerAliases } from "../country-details/data";
import { CountryIncome } from "../../types/models";
import { useVisualizationDispatch } from "../../../../components/viz/visualization-context";
import { formatFloat } from "@/lib/format";
import { useAnalysisWorker } from "../../worker/useAnalysisWorker";
import { Flag } from "@/features/eu4/components/avatars";
import { createCsv } from "@/lib/csv";
import {
  useEu4Actions,
  useShowOnetimeLineItems,
  useTagFilter,
  useValueFormatPreference,
} from "../../store";
import { Switch } from "@/components/Switch";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";

type CountryIncomeRecord = CountryIncome;
const aliases = incomeLedgerAliases();

export const CountriesIncomeTable = () => {
  const { setShowOneTimeLineItems, setPrefersPercents } = useEu4Actions();
  const doShowPercent = useValueFormatPreference() === "percent";
  const showRecurringOnly = !useShowOnetimeLineItems();
  const countryFilter = useTagFilter();
  const visualizationDispatch = useVisualizationDispatch();

  const { data = [], error } = useAnalysisWorker(
    useCallback(
      (worker) =>
        worker.eu4GetCountriesIncome(
          countryFilter,
          doShowPercent,
          showRecurringOnly,
        ),
      [countryFilter, doShowPercent, showRecurringOnly],
    ),
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

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<CountryIncomeRecord>();
    const numRenderer = doShowPercent
      ? (x: number) => `${x}%`
      : (x: number) => formatFloat(x, 2);

    return [
      columnHelper.accessor("name", {
        sortingFn: "text",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Country" />
        ),
        cell: ({ row }) => (
          <Flag tag={row.original.tag} name={row.original.name} />
        ),
      }),
      columnHelper.accessor("total", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Total" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      ...aliases.map(([key, text]) =>
        columnHelper.accessor(key, {
          sortingFn: "basic",
          header: ({ column }) => (
            <Table.ColumnHeader column={column} title={text} />
          ),
          meta: { className: "text-right" },
          cell: (info) => numRenderer(info.getValue()),
        }),
      ),
    ];
  }, [doShowPercent]);

  return (
    <>
      <Alert.Error msg={error} />
      <div className="flex flex-col space-y-6">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-2">
            <span>Show as percentages:</span>
            <Switch
              checked={doShowPercent}
              onCheckedChange={setPrefersPercents}
            />
          </div>

          <div className="flex items-center space-x-2">
            <span>Recurring expenses only:</span>
            <Switch
              checked={showRecurringOnly}
              onCheckedChange={(checked) => setShowOneTimeLineItems(!checked)}
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          data={data}
          pagination={true}
          initialSorting={[{ id: "total", desc: true }]}
        />
      </div>
    </>
  );
};
