import React from "react";
import { AnnualLedger } from "./AnnualLedger";
import { LedgerSelection, useLedgerData } from "./hooks";

const selectAnnualNationSizeData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualNationSizeData(filter);
export const AnnualNationSize = () => {
  const data = useLedgerData(selectAnnualNationSizeData);
  return <AnnualLedger ledger={data} />;
};
