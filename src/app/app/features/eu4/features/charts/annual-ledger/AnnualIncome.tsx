import { AnnualLedger } from "./AnnualLedger";
import { useLedgerData } from "./hooks";
import type { LedgerSelection } from "./hooks";

const selectAnnualIncomeData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualIncomeData(filter);

export const AnnualIncome = () => {
  const data = useLedgerData(selectAnnualIncomeData);

  return <AnnualLedger ledger={data} />;
};
