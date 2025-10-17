import { useCallback } from "react";
import {
  type CountryMatcher,
  type LedgerDatum,
} from "@/features/eu4/types/models";
import { type Eu4Worker, useAnalysisWorker } from "@/features/eu4/worker";
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
