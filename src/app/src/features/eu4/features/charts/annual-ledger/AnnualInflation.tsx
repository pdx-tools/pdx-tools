import React from "react";
import { AnnualLedger } from "./AnnualLedger";
import { LedgerSelection, useLedgerData } from "./hooks";

const selectAnnualInflationData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualInflationData(filter);

export const AnnualInflation = () => {
  const data = useLedgerData(selectAnnualInflationData);

  return <AnnualLedger ledger={data} />;
};
