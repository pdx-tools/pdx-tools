import { useMemo } from "react";
import { CountryDetails } from "../../types/models";

export const useIsJuniorPartner = (details: CountryDetails) => {
  return useMemo(
    () =>
      details.diplomacy.find(
        (x) =>
          x.data.kind === "Dependency" &&
          x.second.tag === details.tag &&
          x.data.subject_type === "personal_union",
      ) !== undefined,
    [details],
  );
};
