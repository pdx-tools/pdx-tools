import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { CountryMatcher, LedgerDatum } from "@/features/eu4/types/models";
import { selectEu4CountryFilter } from "@/features/eu4/eu4Slice";
import { WorkerClient, useAnalysisWorker } from "@/features/engine";

export type LedgerSelection = (
  worker: WorkerClient,
  filter: CountryMatcher
) => Promise<LedgerDatum[]>;

export function useLedgerData(fn: LedgerSelection): LedgerDatum[] {
  const [data, setData] = useState<LedgerDatum[]>([]);
  const countryFilter = useSelector(selectEu4CountryFilter);
  const cb = useCallback(
    async (worker: WorkerClient) => {
      const data = await fn(worker, countryFilter);
      setData(data);
    },
    [fn, countryFilter]
  );

  useAnalysisWorker(cb);

  return data;
}
