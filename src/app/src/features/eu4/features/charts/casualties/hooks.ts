import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { CountryLosses } from "@/features/eu4/types/models";
import { selectEu4CountryFilter } from "@/features/eu4/eu4Slice";
import { WorkerClient, useAnalysisWorker } from "@/features/engine";

export type TableLosses = CountryLosses;

export function useCountryCasualtyData() {
  const [data, setData] = useState<TableLosses[]>([]);
  const countryFilter = useSelector(selectEu4CountryFilter);
  const cb = useCallback(
    async (worker: WorkerClient) => {
      const data = await worker.eu4GetCountriesWarLosses(countryFilter);

      const result = data.filter(
        (x) => x.tag !== "REB" && x.tag !== "NAT" && x.tag !== "PIR"
      );

      setData(result);
    },
    [countryFilter]
  );

  useAnalysisWorker(cb);

  return data;
}
