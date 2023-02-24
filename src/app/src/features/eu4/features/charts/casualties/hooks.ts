import { useCallback } from "react";
import { CountryLosses } from "@/features/eu4/types/models";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { useTagFilter } from "@/features/eu4/Eu4SaveProvider";

export type TableLosses = CountryLosses;

export function useCountryCasualtyData() {
  const countryFilter = useTagFilter();
  const { data } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetCountriesWarLosses(countryFilter),
      [countryFilter]
    )
  );
  return data ?? [];
}
