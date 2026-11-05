import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { useEu5CustomTitle, useEu5HomeCountry, useEu5PlaythroughName } from "../store";
import { campaignName } from "./selection";

/** The name of the save's own country, for the line that says what the save is */
export function useSavedCountryName(): string | undefined {
  const home = useEu5HomeCountry();
  const countryIdx = home?.countryIdx ?? null;
  const { data } = useEu5Trigger(
    (engine) =>
      countryIdx === null
        ? Promise.resolve(undefined)
        : engine.queries.getCountryProfile(countryIdx),
    [countryIdx],
  );
  return data?.header.name;
}

/** The campaign's name in the header and on an image: the reader's, or the save's */
export function useCampaignTitle(): string {
  const custom = useEu5CustomTitle();
  const playthrough = useEu5PlaythroughName();
  return custom ?? campaignName(playthrough);
}
