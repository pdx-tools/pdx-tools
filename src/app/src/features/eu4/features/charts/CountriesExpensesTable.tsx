import React from "react";
import { CountriesExpensesBaseTable } from "./CountriesExpensesBaseTable";

export const CountriesExpensesTable: React.FC<{}> = () => {
  return <CountriesExpensesBaseTable monthlyExpenses={true} />;
};
