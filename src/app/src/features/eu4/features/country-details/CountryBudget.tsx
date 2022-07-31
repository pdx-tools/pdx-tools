import React, { useMemo, useState } from "react";
import { Typography, Space, Switch } from "antd";
import type { BarConfig } from "@ant-design/charts";
import {
  expenseLedgerColorPalette,
  filterExpenses,
  filterIncome,
  incomeLedgerColorPalette,
} from "./data";
import { formatInt } from "@/lib/format";
import { CountryDetails } from "../../types/models";
import { Bar, PieTable } from "@/components/viz";
const { Text } = Typography;

interface CountryBudgetCountProps {
  details: CountryDetails;
}

export const CountryBudget = ({ details }: CountryBudgetCountProps) => {
  const [showRecurringOnly, setRecurOnly] = useState(false);
  const income = useMemo(
    () => filterIncome(details.income, showRecurringOnly),
    [details.income, showRecurringOnly]
  );
  const expenses = useMemo(
    () => filterExpenses(details.expenses, showRecurringOnly),
    [details.expenses, showRecurringOnly]
  );
  const totalExpenses = useMemo(
    () => filterExpenses(details.total_expenses, showRecurringOnly),
    [details.total_expenses, showRecurringOnly]
  );

  const totalIncome = income.reduce((acc, x) => x.value + acc, 0);
  const totalExpense = expenses.reduce((acc, x) => x.value + acc, 0);
  const overviewConfig: BarConfig = {
    data: [
      {
        key: "Income",
        value: totalIncome,
      },
      {
        key: "Expenses",
        value: totalExpense,
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

  const incomePalette = new Map(incomeLedgerColorPalette());
  const expensePalette = new Map(expenseLedgerColorPalette());

  return (
    <>
      <Space>
        <Text>Recurring income / expenses only:</Text>
        <Switch
          checked={showRecurringOnly}
          onChange={(checked: boolean) => setRecurOnly(checked)}
        />
      </Space>
      <div>
        <Bar {...overviewConfig} />
      </div>
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
      />
    </>
  );
};
