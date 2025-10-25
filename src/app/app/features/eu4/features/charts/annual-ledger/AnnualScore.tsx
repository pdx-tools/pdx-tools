import { AnnualLedger } from "./AnnualLedger";
import { useLedgerData } from "./hooks";
import type { LedgerSelection } from "./hooks";

const selectAnnualScoreData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualScoreData(filter);
export const AnnualScore = () => {
  const data = useLedgerData(selectAnnualScoreData);
  return <AnnualLedger ledger={data} />;
};
