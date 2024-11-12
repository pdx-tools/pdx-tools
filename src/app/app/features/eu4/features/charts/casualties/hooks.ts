import { useCallback } from "react";
import { CountryLosses } from "@/features/eu4/types/models";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { useTagFilter } from "@/features/eu4/store";

export type TableLosses = CountryLosses;

export function useCountryCasualtyData() {
  const countryFilter = useTagFilter();
  const { data = [], error } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetCountriesWarLosses(countryFilter),
      [countryFilter],
    ),
  );
  return { data, error };
}
