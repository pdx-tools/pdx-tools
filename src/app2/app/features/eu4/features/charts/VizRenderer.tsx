import React from "react";
import { IdeaGroupsChart } from "./IdeaGroupsChart";
import { VizModules } from "../../types/visualizations";
import {
  AnnualIncome,
  AnnualScore,
  AnnualNationSize,
  AnnualInflation,
} from "./annual-ledger";
import { HealthGrid } from "./HealthGrid";
import { WarTable } from "./WarTable";
import { CountriesArmyCasualtiesTable } from "./casualties/CountriesArmyCasualtiesTable";
import { CountriesNavyCasualtiesTable } from "./casualties/CountriesNavyCasualtiesTable";
import { CountriesExpensesTable } from "./CountriesExpensesTable";
import { CountriesIncomeTable } from "./CountriesIncomeTable";
import { CountriesTotalExpensesTable } from "./CountriesTotalExpensesTable";
import { GeographicalDevelopmentTree } from "./GeographicalDevelopmentTree";
import { OwnedDevelopmentStatesTree } from "./OwnedDevelopmentStatesTree";
import { ProvinceDataTable } from "./ProvinceDataTable";
import { DevEfficiency } from "./DevEfficiency";

interface VizRendererProps {
  module: VizModules;
}

export const VizRenderer = ({ module }: VizRendererProps) => {
  switch (module) {
    case "idea-group":
      return <IdeaGroupsChart />;
    case "monthly-income":
      return <AnnualIncome />;
    case "score":
      return <AnnualScore />;
    case "nation-size":
      return <AnnualNationSize />;
    case "inflation":
      return <AnnualInflation />;
    case "health":
      return <HealthGrid />;
    case "income-table":
      return <CountriesIncomeTable />;
    case "expense-table":
      return <CountriesExpensesTable />;
    case "total-expense-table":
      return <CountriesTotalExpensesTable />;
    case "army-casualties":
      return <CountriesArmyCasualtiesTable />;
    case "navy-casualties":
      return <CountriesNavyCasualtiesTable />;
    case "wars":
      return <WarTable />;
    case "geographical-development":
      return <GeographicalDevelopmentTree />;
    case "owned-development-states":
      return <OwnedDevelopmentStatesTree />;
    case "provinces":
      return <ProvinceDataTable />;
    case "dev-efficiency":
      return <DevEfficiency />;
  }
};
