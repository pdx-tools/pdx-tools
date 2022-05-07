import React, { useCallback, useState } from "react";
import { Alert } from "antd";
import { useSelector } from "react-redux";
import { selectEu4CountryFilter } from "@/features/eu4/eu4Slice";
import { WorkerClient, useAnalysisWorker } from "@/features/engine";

interface DisplayLimitAlertProps {
  displayLimit: number;
}

export const DisplayLimitAlert = ({ displayLimit }: DisplayLimitAlertProps) => {
  const countryFilter = useSelector(selectEu4CountryFilter);
  const [limitExceeded, setLimitExceeded] = useState(false);

  const cb = useCallback(
    async (worker: WorkerClient) => {
      const data = await worker.eu4MatchingCountries(countryFilter);
      setLimitExceeded(data.length > displayLimit);
    },
    [displayLimit, countryFilter]
  );

  useAnalysisWorker(cb);

  if (limitExceeded) {
    return (
      <Alert
        type="warning"
        message={`Display limited to ${displayLimit} countries`}
      />
    );
  } else {
    return null;
  }
};
