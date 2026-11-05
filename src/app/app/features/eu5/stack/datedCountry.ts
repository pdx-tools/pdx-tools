import type { DatedLand } from "@/wasm/wasm_eu5";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { useEu5TimelineLive, useEu5TimelineMapDate } from "../store";

/**
 * A country as it was on the date the map shows: its name, arms, colour, and land. At
 * the save this is empty, because the live record already says all of it.
 */
export function useDatedCountry(countryIdx: number | null): DatedLand | undefined {
  const live = useEu5TimelineLive();
  const date = useEu5TimelineMapDate();
  const { data } = useEu5Trigger(
    (engine) =>
      countryIdx === null || live
        ? Promise.resolve(undefined)
        : engine.queries.getDatedLand(countryIdx),
    [countryIdx, live, date.year, date.month, date.day],
  );
  return live ? undefined : (data ?? undefined);
}
