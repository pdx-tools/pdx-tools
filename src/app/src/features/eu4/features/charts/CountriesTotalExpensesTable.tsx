import React from "react";
import { CountriesExpensesBaseTable } from "./CountriesExpensesBaseTable";

export const CountriesTotalExpensesTable: React.FC<{}> = () => {
  return <CountriesExpensesBaseTable monthlyExpenses={false} />;
};
