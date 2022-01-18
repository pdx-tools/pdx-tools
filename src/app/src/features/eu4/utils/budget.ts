import {
  filterToRecurringExpenses,
  filterToRecurringIncome,
} from "../features/country-details/data";
import {
  CountryExpenses,
  CountryIncome,
  LocalizedCountryExpense,
  LocalizedCountryIncome,
} from "../types/models";

export const reduceToTableLedger = (
  data: Record<string, LocalizedCountryIncome>,
  percent: boolean,
  recurringOnly: boolean
): CountryIncome[] => {
  let entries = Object.entries(data);

  if (recurringOnly) {
    entries = entries.map(([key, value]) => [
      key,
      { ...value, income: filterToRecurringIncome(value.income) },
    ]);
  }

  const tableData = entries.map(([tag, { name, income }]) => {
    const total = Object.values(income).reduce((acc, x) => x + acc, 0);
    const vals = !percent
      ? income
      : Object.fromEntries(
          Object.entries(income).map(([key, value]) => [
            key,
            Math.round((value / total) * 100),
          ])
        );

    return {
      tag,
      name,
      total,
      ...vals,
    } as CountryIncome;
  });
  tableData.sort((a, b) => a.name.localeCompare(b.name));
  return tableData;
};

export const reduceToTableExpenseLedger = (
  data: Record<string, LocalizedCountryExpense>,
  percent: boolean,
  recurringOnly: boolean
): CountryExpenses[] => {
  let entries = Object.entries(data);

  if (recurringOnly) {
    entries = entries.map(([key, value]) => [
      key,
      { ...value, expenses: filterToRecurringExpenses(value.expenses) },
    ]);
  }

  const tableData = entries.map(([tag, { name, expenses }]) => {
    const total = Object.values(expenses).reduce((acc, x) => x + acc, 0);
    const vals = !percent
      ? expenses
      : Object.fromEntries(
          Object.entries(expenses).map(([key, value]) => [
            key,
            Math.round((value / total) * 100),
          ])
        );

    return {
      tag,
      name,
      total,
      ...vals,
    } as CountryExpenses;
  });
  tableData.sort((a, b) => a.name.localeCompare(b.name));
  return tableData;
};
