import { AnnualLedger } from "./AnnualLedger";
import { type LedgerSelection, useLedgerData } from "./hooks";

const selectAnnualNationSizeData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualNationSizeData(filter);
export const AnnualNationSize = () => {
  const data = useLedgerData(selectAnnualNationSizeData);
  return <AnnualLedger ledger={data} />;
};
