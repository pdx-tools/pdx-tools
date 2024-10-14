import React, { useCallback, useEffect, useMemo } from "react";
import { useVisualizationDispatch } from "@/components/viz/visualization-context";
import { CountryExpenses } from "@/features/eu4/types/models";
import { expenseLedgerAliases } from "../country-details/data";
import { formatFloat, formatInt } from "@/lib/format";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { Flag } from "@/features/eu4/components/avatars";
import { createCsv } from "@/lib/csv";
import {
  useEu4Actions,
  useShowOnetimeLineItems,
  useTagFilter,
  useValueFormatPreference,
} from "../../store";
import { Switch } from "@/components/Switch";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";

type CountryExpensesRecord = CountryExpenses;

type BaseTableProps = {
  monthlyExpenses: boolean;
};

const mapping = expenseLedgerAliases();

export const CountriesExpensesBaseTable = ({
  monthlyExpenses,
}: BaseTableProps) => {
  const { setShowOneTimeLineItems, setPrefersPercents } = useEu4Actions();
  const doShowPercent = useValueFormatPreference() === "percent";
  const showRecurringOnly = !useShowOnetimeLineItems();
  const countryFilter = useTagFilter();
  const visualizationDispatch = useVisualizationDispatch();

  const { data = [] } = useAnalysisWorker(
    useCallback(
      (worker) =>
        monthlyExpenses
          ? worker.eu4GetCountriesExpenses(
              countryFilter,
              doShowPercent,
              showRecurringOnly,
            )
          : worker.eu4GetCountriesTotalExpenses(
              countryFilter,
              doShowPercent,
              showRecurringOnly,
            ),
      [countryFilter, doShowPercent, showRecurringOnly, monthlyExpenses],
    ),
  );

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

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<CountryExpensesRecord>();
    const numRenderer = doShowPercent
      ? (x: number) => `${x}%`
      : monthlyExpenses
        ? (x: number) => formatFloat(x, 2)
        : (x: number) => formatInt(x);

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
        cell: (info) => formatInt(info.getValue()),
      }),
      ...mapping.map(([key, text]) =>
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
  }, [doShowPercent, monthlyExpenses]);

  return (
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
  );
};
