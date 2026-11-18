import { useCallback } from "react";
import { useEu4Worker } from "../../worker";
import { emptyEu4CountryFilter } from "../../store";
import { ProvinceTable } from "../charts/ProvinceDataTable";

/** The provinces that a country owns. Its subjects are not included. */
export function CountryProvinces({ tag }: { tag: string }) {
  const { data, error } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetProvinces({ ...emptyEu4CountryFilter, include: [tag] }),
      [tag],
    ),
  );

  return <ProvinceTable provinces={data} error={error} showOwner={false} />;
}
