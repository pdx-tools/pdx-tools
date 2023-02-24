import React, { useCallback } from "react";
import { Alert } from "antd";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { useTagFilter } from "../../Eu4SaveProvider";

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
      <Alert
        type="warning"
        message="Too many countries in filter, display limited to players and great countries"
        closable
      />
    );
  } else {
    return null;
  }
};
