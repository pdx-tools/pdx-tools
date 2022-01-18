import React from "react";
import { AnnualLedger } from "./AnnualLedger";
import { LedgerSelection, useLedgerData } from "./hooks";

const selectAnnualIncomeData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualIncomeData(filter);

export const AnnualIncome: React.FC<{}> = () => {
  const data = useLedgerData(selectAnnualIncomeData);

  return <AnnualLedger ledger={data} />;
};
