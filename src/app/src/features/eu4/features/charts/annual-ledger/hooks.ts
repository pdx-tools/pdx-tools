import { useCallback } from "react";
import { CountryMatcher, LedgerDatum } from "@/features/eu4/types/models";
import { Eu4Worker, useAnalysisWorker } from "@/features/eu4/worker";
import { useTagFilter } from "@/features/eu4/Eu4SaveProvider";

export type LedgerSelection = (
  worker: Eu4Worker,
  filter: CountryMatcher
) => Promise<LedgerDatum[]>;

export function useLedgerData(fn: LedgerSelection): LedgerDatum[] {
  const countryFilter = useTagFilter();
  const { data } = useAnalysisWorker(
    useCallback((worker) => fn(worker, countryFilter), [fn, countryFilter])
  );
  return data ?? [];
}
