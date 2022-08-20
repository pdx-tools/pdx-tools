import { useMemo } from "react";
import { CountryDetails } from "../../types/models";

export const useIsJuniorPartner = (details: CountryDetails) => {
  return useMemo(
    () =>
      details.diplomacy.find(
        (x) =>
          x.kind === "Dependency" &&
          x.second.tag === details.tag &&
          x.subject_type === "personal_union"
      ) !== undefined,
    [details]
  );
};
