import { AnnualLedger } from "./AnnualLedger";
import { type LedgerSelection, useLedgerData } from "./hooks";

const selectAnnualIncomeData: LedgerSelection = (worker, filter) =>
  worker.eu4GetAnnualIncomeData(filter);

export const AnnualIncome = () => {
  const data = useLedgerData(selectAnnualIncomeData);

  return <AnnualLedger ledger={data} />;
};
