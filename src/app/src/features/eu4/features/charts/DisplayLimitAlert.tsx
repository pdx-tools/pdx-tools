import React, { useCallback } from "react";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { useTagFilter } from "../../store";
import { Alert, AlertDescription } from "@/components/Alert";

type DisplayLimitAlertProps = {
  displayLimit: number;
};

export const DisplayLimitAlert = ({ displayLimit }: DisplayLimitAlertProps) => {
  const countryFilter = useTagFilter();
  const matchingCountries = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4MatchingCountries(countryFilter),
      [countryFilter]
    )
  );
  const limitExceeded = (matchingCountries.data?.length ?? 0) > displayLimit;

  if (limitExceeded) {
    return (
      <Alert variant="warning" className="px-4 py-2">
        <AlertDescription>
          Too many countries in filter, display limited to players and great
          countries
        </AlertDescription>
      </Alert>
    );
  } else {
    return null;
  }
};
