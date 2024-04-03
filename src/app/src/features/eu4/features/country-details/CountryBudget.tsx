import React, { useMemo, useState } from "react";
import {
  expenseLedgerColorPalette,
  filterExpenses,
  filterIncome,
  incomeLedgerColorPalette,
} from "./data";
import { formatInt } from "@/lib/format";
import { CountryDetails } from "../../types/models";
import { Bar, BarConfig, PieTable } from "@/components/viz";
import { Switch } from "@/components/Switch";
import { isDarkMode } from "@/lib/dark";

type CountryBudgetCountProps = {
  details: CountryDetails;
};

const incomePalette = new Map(incomeLedgerColorPalette());
const expensePalette = new Map(expenseLedgerColorPalette());

const BudgetBar = React.memo(function BudgetBar({
  income,
  expenses,
}: {
  income: number;
  expenses: number;
}) {
  const overviewConfig: BarConfig = {
    data: [
      {
        key: "Income",
        value: income,
      },
      {
        key: "Expenses",
        value: expenses,
      },
    ],
    width: 500,
    height: 200,
    xField: "value",
    yField: "key",
    seriesField: "key",
    color: (v: Record<string, any>) => {
      switch (v["key"]) {
        case "Income":
          return "#1383ab";
        case "Expenses":
          return "#c52125";
        default:
          return "#000";
      }
    },
    xAxis: {
      title: {
        text: "ducats",
      },
    },
    legend: {
      itemName: {
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
      },
    },
    tooltip: {
      // @ts-ignore https://github.com/ant-design/ant-design-charts/issues/1474
      formatter: (datum) => ({
        name: datum.key,
        value: formatInt(datum.value || 0),
      }),
    },
    label: {
      style: {
        fill: "#fff",
      },
      formatter: (datum: any, _item: any) => datum.value.toFixed(0),
    },
  };

  return <Bar {...overviewConfig} />;
});

export const CountryBudget = ({ details }: CountryBudgetCountProps) => {
  const [showRecurringOnly, setRecurOnly] = useState(false);
  const income = useMemo(
    () => filterIncome(details.income, showRecurringOnly),
    [details.income, showRecurringOnly],
  );
  const expenses = useMemo(
    () => filterExpenses(details.expenses, showRecurringOnly),
    [details.expenses, showRecurringOnly],
  );
  const totalExpenses = useMemo(
    () => filterExpenses(details.total_expenses, showRecurringOnly),
    [details.total_expenses, showRecurringOnly],
  );

  const totalIncome = income.reduce((acc, x) => x.value + acc, 0);
  const totalExpense = expenses.reduce((acc, x) => x.value + acc, 0);

  return (
    <>
      <div className="flex items-center space-x-2">
        <span>Recurring income / expenses only:</span>
        <Switch
          checked={showRecurringOnly}
          onCheckedChange={(checked) => setRecurOnly(checked)}
        />
      </div>
      <div>
        <BudgetBar income={totalIncome} expenses={totalExpense} />
      </div>
      <div className="flex flex-wrap gap-6">
        <PieTable
          palette={incomePalette}
          title="Last Month Income Breakdown"
          rows={income}
        />
        <PieTable
          palette={expensePalette}
          title="Last Month Expense Breakdown"
          rows={expenses}
        />
        <PieTable
          palette={expensePalette}
          title="Total Expense Breakdown"
          rows={totalExpenses}
          paginate={true}
          wholeNumbers={true}
        />
      </div>
    </>
  );
};
