import { AnnualLedger } from "./AnnualLedger";
import { useLedgerData } from "./hooks";
import type { LedgerSelection } from "./hooks";

const selectAnnualNationSizeData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualNationSizeData(filter);
export const AnnualNationSize = () => {
  const data = useLedgerData(selectAnnualNationSizeData);
  return <AnnualLedger ledger={data} />;
};
