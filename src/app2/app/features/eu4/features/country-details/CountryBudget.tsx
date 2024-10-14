import React, { useCallback, useEffect, useRef, useState } from "react";
import { incomeLedgerAliases } from "./data";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails } from "../../types/models";
import { axisTop } from "d3-axis";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { cx } from "class-variance-authority";
import { budgetSelect, createBudget, expenseBudget } from "./budget";
import { Card } from "@/components/Card";
import { useEu4Meta } from "../../store";
import { Button } from "@/components/Button";
import { ToggleGroup } from "@/components/ToggleGroup";
import { throttle } from "@/lib/throttle";
import { isDarkMode } from "@/lib/dark";
import { Treemap, TreemapConfig } from "@/components/viz";
import { emitEvent } from "@/lib/events";
import { classicCyclic } from "@/lib/colors";

type CountryBudgetCountProps = {
  details: CountryDetails;
};

function sumValues(...obj: { [key: string]: any }[]): number {
  return obj.reduce(
    (acc, x) => acc + Object.values(x).reduce((sum, value) => sum + value, 0),
    0,
  );
}

function negate<T extends Record<string, number>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).map(([key, val]) => [key, -val]),
  ) as T;
}

type BudgetBar = { key: string; value: number; start: number; end: number };

export function CountryBudget({ details }: CountryBudgetCountProps) {
  const date = useEu4Meta().date;
  const [ytdYear, ytdMonth] = date.split("-").map((x) => +x);
  const ytdMonthDivisor = Math.max(+ytdMonth - 1, 1);
  const incomeAliases: Map<string, string> = new Map(incomeLedgerAliases());
  const totalExpenses = expenseBudget(details.total_expenses);
  const totalDucatsSpent = budgetSelect.totalExpenses(totalExpenses);

  const lastMonthBudget = createBudget({
    income: details.income,
    expenses: details.expenses,
  });

  const ytdDateBudget = budgetSelect.divide(
    createBudget({
      income: details.ytd_income,
      expenses: details.ytd_expenses,
    }),
    ytdMonthDivisor,
  );

  const lastYearBudget = budgetSelect.divide(
    createBudget({
      income: details.last_year_income,
      expenses: details.last_year_expenses,
    }),
    12,
  );

  const [budgetInterval, setBudgetInterval] = useState<
    "last-month" | "ytd" | "last-year"
  >("last-year");
  switch (budgetInterval) {
    case "last-month": {
      var budget = lastMonthBudget;
      break;
    }
    case "ytd": {
      var budget = ytdDateBudget;
      break;
    }
    case "last-year": {
      var budget = lastYearBudget;
      break;
    }
  }

  const recurringRevenue = budgetSelect.recurringRevenue(budget);
  const netProfit = budgetSelect.netProfit(budget);
  const operatingProfit = budgetSelect.operatingProfit(budget);

  const maxX = Math.max(recurringRevenue, netProfit, 0);
  const minX = Math.min(operatingProfit, netProfit, 0);

  const [width, setWidth] = useState(920);
  const marginTop = 20;
  const marginRight = 175;
  const marginBottom = 30;
  const marginLeft = 20;

  const axisPadding = 8;

  const x = scaleLinear()
    .domain([minX, maxX])
    .range([0, width - marginRight - marginLeft]);

  let startBar = x(0);
  const bars: {
    [P in
      | keyof typeof budget
      | "Recurring Revenue"
      | "Operating Expenses"
      | "Operating Profit"
      | "Net Profit"]?: BudgetBar[] | BudgetBar;
  } = {};
  bars["Core Income"] = Object.entries(budget["Core Income"])
    .map(([key, value]) => [incomeAliases.get(key) ?? key, value] as const)
    .filter(([, value]) => value !== 0.0)
    .reduce((acc: BudgetBar[], [key, value]) => {
      const start = acc.at(-1)?.end ?? startBar;
      const end = start + x(value) - x(0);
      acc.push({ key, value, start, end });
      return acc;
    }, []);

  startBar = bars["Core Income"].at(-1)?.end ?? x(0);

  if (sumValues(budget["Subject Income"])) {
    bars["Subject Income"] = Object.entries(budget["Subject Income"])
      .map(([key, value]) => [incomeAliases.get(key) ?? key, value] as const)
      .filter(([, value]) => value !== 0.0)
      .reduce((acc: BudgetBar[], [key, value]) => {
        const start = acc.at(-1)?.end ?? startBar;
        const end = start + x(value) - x(0);
        acc.push({ key, value, start, end });
        return acc;
      }, []);
    startBar = bars["Subject Income"].at(-1)?.end ?? x(0);
  }

  if (sumValues(budget["Diplomatic Income"])) {
    bars["Diplomatic Income"] = Object.entries(budget["Diplomatic Income"])
      .map(([key, value]) => [incomeAliases.get(key) ?? key, value] as const)
      .filter(([, value]) => value !== 0.0)
      .reduce((acc: BudgetBar[], [key, value]) => {
        const start = acc.at(-1)?.end ?? startBar;
        const end = start + x(value) - x(0);
        acc.push({ key, value, start, end });
        return acc;
      }, []);
    startBar = bars["Diplomatic Income"].at(-1)?.end ?? x(0);
  }

  startBar = x(recurringRevenue);
  const recurringRevenueEnd = startBar;
  bars["Recurring Revenue"] = {
    key: "Recurring Revenue",
    start: x(0),
    end: recurringRevenueEnd,
    value: recurringRevenue,
  };

  if (sumValues(budget["Maintenance"])) {
    bars["Maintenance"] = Object.entries(negate(budget["Maintenance"]))
      .filter(([, value]) => value !== 0.0)
      .reduce((acc: BudgetBar[], [key, value]) => {
        const start = acc.at(-1)?.end ?? startBar;
        const end = start + x(value) - x(0);
        acc.push({ key, value, start, end });
        return acc;
      }, []);
    startBar = bars["Maintenance"].at(-1)?.end ?? x(0);
  }

  if (sumValues(budget["Interest Payments"])) {
    bars["Interest Payments"] = Object.entries(
      negate(budget["Interest Payments"]),
    )
      .map(([key, value]) => [incomeAliases.get(key) ?? key, value] as const)
      .filter(([, value]) => value !== 0.0)
      .reduce((acc: BudgetBar[], [key, value]) => {
        const start = acc.at(-1)?.end ?? startBar;
        const end = start + x(value) - x(0);
        acc.push({ key, value, start, end });
        return acc;
      }, []);
    startBar = bars["Interest Payments"].at(-1)?.end ?? x(0);
  }

  if (sumValues(budget["Diplomatic Expenses"])) {
    bars["Diplomatic Expenses"] = Object.entries(
      negate(budget["Diplomatic Expenses"]),
    )
      .map(([key, value]) => [incomeAliases.get(key) ?? key, value] as const)
      .filter(([, value]) => value !== 0.0)
      .reduce((acc: BudgetBar[], [key, value]) => {
        const start = acc.at(-1)?.end ?? startBar;
        const end = start + x(value) - x(0);
        acc.push({ key, value, start, end });
        return acc;
      }, []);
    startBar = bars["Diplomatic Expenses"].at(-1)?.end ?? x(0);
  }

  bars["Operating Profit"] = {
    key: "Operating Profit",
    start: x(0),
    end: x(operatingProfit),
    value: operatingProfit,
  };

  if (sumValues(budget["One-time Income"])) {
    bars["One-time Income"] = Object.entries(budget["One-time Income"])
      .map(([key, value]) => [incomeAliases.get(key) ?? key, value] as const)
      .filter(([, value]) => value !== 0.0)
      .reduce((acc: BudgetBar[], [key, value]) => {
        const start = acc.at(-1)?.end ?? startBar;
        const end = start + x(value) - x(0);
        acc.push({ key, value, start, end });
        return acc;
      }, []);
    startBar = bars["One-time Income"].at(-1)?.end ?? x(0);
  }

  if (sumValues(budget["One-time Expenses"])) {
    bars["One-time Expenses"] = Object.entries(
      negate(budget["One-time Expenses"]),
    )
      .map(([key, value]) => [incomeAliases.get(key) ?? key, value] as const)
      .filter(([, value]) => value !== 0.0)
      .reduce((acc: BudgetBar[], [key, value]) => {
        const start = acc.at(-1)?.end ?? startBar;
        const end = start + x(value) - x(0);
        acc.push({ key, value, start, end });
        return acc;
      }, []);
    startBar = bars["One-time Expenses"].at(-1)?.end ?? x(0);
  }

  if (sumValues(budget["Capital Expenditure"])) {
    bars["Capital Expenditure"] = Object.entries(
      negate(budget["Capital Expenditure"]),
    )
      .map(([key, value]) => [incomeAliases.get(key) ?? key, value] as const)
      .filter(([, value]) => value !== 0.0)
      .reduce((acc: BudgetBar[], [key, value]) => {
        const start = acc.at(-1)?.end ?? startBar;
        const end = start + x(value) - x(0);
        acc.push({ key, value, start, end });
        return acc;
      }, []);
    startBar = bars["Capital Expenditure"].at(-1)?.end ?? x(0);
  }

  bars["Net Profit"] = {
    key: "Net Profit",
    start: x(0),
    end: x(netProfit),
    value: netProfit,
  };

  const barLabels = Object.keys(bars);
  const height = 66 * barLabels.length + marginTop + axisPadding + marginBottom;

  const y = scaleBand(barLabels, [
    0,
    height - marginBottom - marginTop - axisPadding,
  ]).padding(0.1);

  const gxCb = useCallback(
    (gx: SVGGElement | null) => {
      if (!gx) {
        return;
      }

      select(gx).call(axisTop(x));
    },
    [x],
  );

  const isExpense = (
    kind: keyof typeof budget | keyof typeof totalExpenses,
  ): kind is keyof typeof totalExpenses => kind in totalExpenses;

  const hasSection = (kind: keyof typeof budget | keyof typeof totalExpenses) =>
    sumValues(budget[kind]) ||
    sumValues(ytdDateBudget[kind]) ||
    sumValues(lastYearBudget[kind]) ||
    (isExpense(kind) && sumValues(totalExpenses[kind]));

  const hasRow = <KIND extends keyof typeof budget>(
    kind: KIND,
    key: keyof (typeof budget)[KIND],
  ) =>
    budget[kind][key] || ytdDateBudget[kind][key] || lastYearBudget[kind][key];

  const hasExpenseRow = <KIND extends keyof typeof totalExpenses>(
    kind: KIND,
    key: keyof (typeof totalExpenses)[KIND],
  ) => hasRow(kind, key) || totalExpenses[kind][key];

  const allIncomes = [lastMonthBudget, ytdDateBudget, lastYearBudget];
  const allExpenses = [
    lastMonthBudget,
    ytdDateBudget,
    lastYearBudget,
    totalExpenses,
  ];

  const PercentTotal = ({
    value,
    className,
  }: {
    value: number;
    className?: string;
  }) => (
    <td className={cx("pl-4 text-right", className)}>
      {formatFloat((value / totalDucatsSpent) * 100, 2)}%
    </td>
  );

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mounted = true;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeCb: ResizeObserverCallback = ([entry]) => {
      if (!mounted) {
        return;
      }

      setWidth(Math.max(entry.contentRect.width, 920));
    };

    const throttled = throttle(resizeCb, 100);
    const observer = new ResizeObserver(throttled);

    observer.observe(container, {
      box: "border-box",
    });

    return () => {
      observer.disconnect();
      mounted = false;
    };
  }, []);

  const treeMapConfig: TreemapConfig = {
    data: {
      name: "root",
      children: Object.entries(totalExpenses).map(([kind, obj]) => ({
        name: kind,
        kind,
        value: sumValues(obj),
        children: Object.entries(obj).map(([key, value]) => ({
          name: key,
          value,
        })),
      })),
    },
    colorField: "kind",
    color(datum, _defaultColor) {
      let x = datum as { kind: keyof typeof totalExpenses };
      switch (x.kind) {
        case "Maintenance":
          return classicCyclic[9];
        case "Interest Payments":
          return classicCyclic[5];
        case "Diplomatic Expenses":
          return classicCyclic[12];
        case "One-time Expenses":
          return classicCyclic[13];
        case "Capital Expenditure":
          return classicCyclic[0];
      }
    },
    legend: {
      position: "top-left",
      itemName: {
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
      },
    },
    tooltip: {
      formatter: (v) => {
        // const root = v.path[v.path.length - 1];
        // const datum = v.path[0].data;
        return {
          name: v.name,
          value: formatInt(v.value),
        };
      },
    },
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-8 pb-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        <Card className="flex items-center gap-3 p-4">
          <div className="text-2xl font-bold">
            {formatInt(budgetSelect.operatingProfit(lastMonthBudget))}
          </div>
          <div className="w-36 text-balance leading-none text-gray-500 dark:text-gray-300">
            Monthly operating profit
          </div>
        </Card>

        <Card className="flex items-center gap-3 p-4">
          <div className="text-2xl font-bold">
            {formatInt(totalDucatsSpent)}
          </div>
          <div className="w-36 text-balance leading-none text-gray-500 dark:text-gray-300">
            Total ducats spent
          </div>
        </Card>

        <Card className="flex items-center gap-3 p-4">
          <div className="text-2xl font-bold">
            {formatFloat(budgetSelect.capexRatio(totalExpenses) * 100, 2)}%
          </div>
          <div className="w-36 text-balance leading-none text-gray-500 dark:text-gray-300">
            Capital Expediture
          </div>
        </Card>
      </div>

      <ToggleGroup
        type="single"
        className="inline-flex self-center"
        value={budgetInterval}
        onValueChange={(value) => {
          if (!value) {
            return;
          }

          emitEvent({ kind: "Budget interval switched", interval: value });
          setBudgetInterval(value as "last-month" | "ytd" | "last-year");
        }}
      >
        <ToggleGroup.Item value="last-month" asChild>
          <Button shape="none" className="px-4 py-2">
            Last month
          </Button>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="ytd" asChild>
          <Button shape="none" className="px-4 py-2">
            YTD
          </Button>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="last-year" asChild>
          <Button shape="none" className="px-4 py-2">
            Last Year
          </Button>
        </ToggleGroup.Item>
      </ToggleGroup>

      <div className="text-center">
        <h3 className="text-bold text-lg font-semibold">
          Budget Waterfall{" "}
          {budgetInterval === "last-month"
            ? `(${new Date(ytdYear, ytdMonth - 1).toLocaleString(undefined, { month: "long" })} ${ytdYear})`
            : budgetInterval === "ytd"
              ? `(${ytdYear} YTD)`
              : `(Year of ${ytdYear - 1})`}
        </h3>
        {budgetInterval !== "last-month" ? "Monthly Average" : null}
      </div>

      <div className="w-full overflow-auto">
        <svg width={width} height={height}>
          <g transform={`translate(${marginLeft}, ${marginTop})`}>
            <g ref={gxCb} />
            <g transform={`translate(0, ${axisPadding})`}>
              <line
                x1={x(0) - 1}
                x2={x(0)}
                y1={0}
                y2={height - marginBottom}
                className="stroke-black dark:stroke-white"
              />

              {Object.entries(bars).map(([category, bar], i) => (
                <g key={i} transform={`translate(0, ${y(barLabels[i])})`}>
                  {Array.isArray(bar) ? (
                    bar.map((x, i) => (
                      <BudgetRect
                        key={x.key}
                        label={x.key}
                        startX={x.start}
                        endX={x.end}
                        height={y.bandwidth()}
                        value={x.value}
                      />
                    ))
                  ) : (
                    <BudgetRect
                      key={bar.key}
                      label={bar.key}
                      startX={bar.start}
                      endX={bar.end}
                      height={y.bandwidth()}
                      value={bar.value}
                      single
                    />
                  )}
                </g>
              ))}

              <g transform={`translate(${width - marginRight}, 0)`}>
                {barLabels.map((x) => (
                  <BarLabel
                    key={x}
                    x={x}
                    y={y(x)}
                    bar={bars[x as keyof typeof bars]}
                    budget={budget[x as keyof typeof budget]}
                  />
                ))}
              </g>
            </g>
          </g>
        </svg>
      </div>

      <div className="w-full max-w-2xl overflow-auto 2xl:w-auto">
        <table>
          <thead>
            <tr>
              <th></th>
              <th className="min-w-24">Last month</th>
              <th className="min-w-24 leading-none">
                <div>YTD</div>
                <Mat />
              </th>
              <th className="min-w-24 leading-none">
                <div>Last Year</div>
                <Mat />
              </th>
              <th className="min-w-28">Total Spent</th>
              <th className="max-w-24 text-balance text-sm font-normal leading-none">
                % of total spent
              </th>
            </tr>
          </thead>
          <tbody>
            {(["Core Income", "Subject Income", "Diplomatic Income"] as const)
              .filter(hasSection)
              .map((kind) => (
                <React.Fragment key={kind}>
                  <tr className="border-b">
                    <td className="pt-4 text-center font-semibold italic">
                      {kind}
                    </td>
                  </tr>

                  {budgetSelect
                    .keys(budget[kind])
                    .filter((key) => hasRow(kind, key))
                    .map((key) => (
                      <tr key={key}>
                        <td>{incomeAliases.get(key)}</td>
                        {allIncomes.map((x, i) => (
                          <td key={i} className="text-right">
                            {formatFloat(x[kind][key], 2)}
                          </td>
                        ))}
                        <td className="text-right">---</td>
                      </tr>
                    ))}
                  <tr className="border-b">
                    <td className="text-center font-semibold italic">
                      Subtotal
                    </td>
                    {allIncomes.map((x, i) => (
                      <td key={i} className="text-right font-semibold italic">
                        {formatFloat(sumValues(x[kind]), 2)}
                      </td>
                    ))}
                    <td className="text-right">---</td>
                  </tr>
                </React.Fragment>
              ))}

            <tr>
              <td className="pt-4" />
            </tr>

            <tr className="bg-gray-200/50 dark:bg-gray-600/50">
              <td className="text-center text-lg font-semibold italic">
                Recurring Revenue
              </td>
              {allIncomes.map((x, i) => (
                <td key={i} className="text-right text-lg font-semibold italic">
                  {formatFloat(budgetSelect.recurringRevenue(x), 2)}
                </td>
              ))}
              <td className="text-right">---</td>
              <td />
            </tr>

            <tr>
              <td className="pt-4" />
            </tr>

            {(["Maintenance", "Diplomatic Expenses"] as const)
              .filter(hasSection)
              .map((kind) => (
                <React.Fragment key={kind}>
                  <tr className="border-b">
                    <td className="pt-4 text-center font-semibold italic">
                      {kind}
                    </td>
                  </tr>
                  {budgetSelect
                    .keys(budget[kind])
                    .filter((key) => hasExpenseRow(kind, key))
                    .map((key) => (
                      <tr key={key}>
                        <td>{key}</td>
                        {allExpenses.map((x, i) => (
                          <td key={i} className="text-right">
                            {formatFloat(x[kind][key], 2)}
                          </td>
                        ))}
                        <PercentTotal value={totalExpenses[kind][key]} />
                      </tr>
                    ))}
                  <tr className="border-b font-semibold italic">
                    <td className="text-center">Subtotal</td>
                    {allExpenses.map((x, i) => (
                      <td key={i} className="text-right">
                        {formatFloat(sumValues(x[kind]), 2)}
                      </td>
                    ))}
                    <PercentTotal value={sumValues(totalExpenses[kind])} />
                  </tr>
                </React.Fragment>
              ))}
            {!!hasSection("Interest Payments") && (
              <tr>
                <td className="pt-3">Interest Payments</td>
                {allExpenses.map((x, i) => (
                  <td key={i} className="text-right">
                    {formatFloat(x["Interest Payments"].Interest, 2)}
                  </td>
                ))}
                <PercentTotal
                  value={totalExpenses["Interest Payments"].Interest}
                />
              </tr>
            )}

            <tr>
              <td className="pt-4" />
            </tr>

            <tr className="bg-gray-200/50 text-lg font-semibold italic dark:bg-gray-600/50">
              <td className="text-center">Operating Expenses</td>
              {allExpenses.map((x, i) => (
                <td key={i} className="text-right">
                  {formatFloat(budgetSelect.operatingExpenses(x), 2)}
                </td>
              ))}
              <PercentTotal
                value={budgetSelect.operatingExpenses(totalExpenses)}
              />
            </tr>

            <tr className="bg-gray-200/50 text-xl font-semibold italic dark:bg-gray-600/50">
              <td className="text-center">Operating Profit</td>
              {allIncomes.map((x, i) => (
                <td key={i} className="text-right">
                  {formatFloat(budgetSelect.operatingProfit(x), 2)}
                </td>
              ))}
              <td className="text-right">---</td>
              <td />
            </tr>

            <tr>
              <td className="pt-5" />
            </tr>

            {!!hasSection("One-time Income") && (
              <>
                <tr className="border-b pt-3">
                  <td className="text-center font-semibold italic">
                    One-time Income
                  </td>
                </tr>
                {budgetSelect
                  .keys(budget["One-time Income"])
                  .filter((key) => hasRow("One-time Income", key))
                  .map((key) => (
                    <tr key={key}>
                      <td>{incomeAliases.get(key)}</td>
                      {allIncomes.map((x, i) => (
                        <td key={i} className="text-right">
                          {formatFloat(x["One-time Income"][key], 2)}
                        </td>
                      ))}

                      <td className="text-right">---</td>
                    </tr>
                  ))}
                <tr className="border-b">
                  <td className="text-center font-semibold italic">Subtotal</td>

                  {allIncomes.map((x, i) => (
                    <td key={i} className="text-right font-semibold italic">
                      {formatFloat(sumValues(x["One-time Income"]), 2)}
                    </td>
                  ))}
                  <td className="text-right">---</td>
                </tr>
              </>
            )}

            {(["One-time Expenses", "Capital Expenditure"] as const)
              .filter(hasSection)
              .map((kind) => (
                <React.Fragment key={kind}>
                  <tr className="border-b">
                    <td className="pt-4 text-center font-semibold italic">
                      {kind}
                    </td>
                  </tr>

                  {budgetSelect
                    .keys(budget[kind])
                    .filter((key) => hasExpenseRow(kind, key))
                    .map((key) => (
                      <tr key={key}>
                        <td>{key}</td>

                        {allExpenses.map((x, i) => (
                          <td key={i} className="text-right">
                            {formatFloat(x[kind][key], 2)}
                          </td>
                        ))}
                        <PercentTotal value={totalExpenses[kind][key]} />
                      </tr>
                    ))}
                  <tr className="border-b font-semibold italic">
                    <td className="text-center">Subtotal</td>
                    {allExpenses.map((x, i) => (
                      <td key={i} className="text-right">
                        {formatFloat(sumValues(x[kind]), 2)}
                      </td>
                    ))}
                    <PercentTotal value={sumValues(totalExpenses[kind])} />
                  </tr>
                </React.Fragment>
              ))}

            <tr>
              <td className="pt-5" />
            </tr>

            <tr className="bg-gray-200/50 dark:bg-gray-600/50">
              <td className="text-center text-xl font-semibold italic">
                Net Profit
              </td>
              {allIncomes.map((x, i) => (
                <td key={i} className="text-right text-xl font-semibold italic">
                  {formatFloat(budgetSelect.netProfit(x), 2)}
                </td>
              ))}
              <td className="text-right">---</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="h-[750px] w-full">
        <h3 className="text-bold text-center text-lg font-semibold">
          Total Expenses Tree
        </h3>
        <Treemap {...treeMapConfig} />
      </div>
    </div>
  );
}

// Padding between stacked bars
const barPadding = 4;
const textPadding = 4;
const textGap = 8;

function BarLabel({
  x,
  y,
  budget,
  bar,
}: {
  x: string;
  y: number | undefined;
  budget?: Record<string, number>;
  bar: BudgetBar[] | BudgetBar | undefined;
}) {
  return (
    <text y={y} dy="2em" fill="currentColor" className="text-sm tracking-tight">
      <tspan>{x}</tspan>
      <tspan x="0" dy="1.2em">
        {Array.isArray(bar) && budget
          ? formatFloat(sumValues(budget), 2)
          : bar && !Array.isArray(bar)
            ? formatFloat(bar.value, 2)
            : null}
      </tspan>
    </text>
  );
}

function BudgetRect({
  startX,
  endX,
  height,
  label,
  value,
  single,
}: {
  startX: number;
  endX: number;
  height: number;
  label: string;
  value: number;
  single?: boolean;
}) {
  const start = value > 0 ? startX : endX;
  const end = value > 0 ? endX : startX;
  const mag = Math.abs(value);
  const labelRef = useRef<SVGTextElement>(null);
  const numRef = useRef<SVGTextElement>(null);
  const padding = single ? 0 : barPadding;
  const width = Math.max(end - start - padding, 1);
  const valueText = formatInt(Math.round(mag));

  useEffect(() => {
    if (!labelRef.current || !numRef.current || single) {
      return;
    }

    labelRef.current.textContent = label;
    numRef.current.textContent = valueText;
    const labelWidth = labelRef.current.getComputedTextLength();
    const numWidth = numRef.current.getComputedTextLength();

    if (labelWidth + numWidth + textGap + textPadding * 2 + padding < width) {
      return;
    }

    if (labelWidth + textPadding + padding < width) {
      numRef.current.textContent = "";
      return;
    }

    if (numWidth + textPadding + padding < width) {
      labelRef.current.textContent = "";
      return;
    }

    numRef.current.textContent = "";
    labelRef.current.textContent = "";
  }, [label, valueText, width, single, padding]);

  return (
    <g
      className={cx(
        single
          ? "fill-gray-600"
          : value > 0
            ? "fill-emerald-600"
            : "fill-rose-800",
      )}
      transform={`translate(${single || value > 0 ? 0 : barPadding}, 0)`}
    >
      <rect x={start} height={height} width={width}>
        <title>
          {label}: {valueText}
        </title>
      </rect>
      <text
        ref={labelRef}
        x={start + textPadding}
        y={height - textPadding}
        className="fill-white text-xs tracking-tight"
      ></text>
      <text
        ref={numRef}
        x={end - textPadding - barPadding}
        y={height - textPadding}
        textAnchor="end"
        className="fill-white text-xs tracking-tight"
      ></text>
    </g>
  );
}

function Mat() {
  return (
    <abbr
      title="Monthly Average"
      className="all-small-caps text-sm font-normal tracking-tight text-gray-500 dark:text-gray-300"
    >
      MON. AVG.
    </abbr>
  );
}
