import React from "react";
import { AnnualLedger } from "./AnnualLedger";
import { LedgerSelection, useLedgerData } from "./hooks";

const selectAnnualScoreData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualScoreData(filter);
export const AnnualScore: React.FC<{}> = () => {
  const data = useLedgerData(selectAnnualScoreData);
  return <AnnualLedger ledger={data} />;
};
