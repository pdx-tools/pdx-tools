import { useCallback } from "react";
import type { CountryMatcher, LedgerDatum } from "@/features/eu4/types/models";
import { useAnalysisWorker } from "@/features/eu4/worker";
import type { Eu4Worker } from "@/features/eu4/worker";
import { useTagFilter } from "@/features/eu4/store";

export type LedgerSelection = (
  worker: Eu4Worker,
  filter: CountryMatcher,
) => Promise<LedgerDatum[]>;

export function useLedgerData(fn: LedgerSelection) {
  const countryFilter = useTagFilter();
  return useAnalysisWorker(
    useCallback((worker) => fn(worker, countryFilter), [fn, countryFilter]),
  );
}
