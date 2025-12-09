import { AnnualLedger } from "./AnnualLedger";
import { useLedgerData } from "./hooks";
import type { LedgerSelection } from "./hooks";

const selectAnnualInflationData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualInflationData(filter);

export const AnnualInflation = () => {
  const data = useLedgerData(selectAnnualInflationData);

  return <AnnualLedger ledger={data} />;
};
