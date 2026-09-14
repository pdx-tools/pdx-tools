import type { SearchResult } from "./ui-engine";

/**
 * What the map does when a search result is picked.
 *
 * A country result carries two indices: `id` is the country index that
 * the selection triggers take, and `locationIdx` is its capital, which
 * only the camera uses. Keep them apart: passing the capital's location
 * index to `selectCountry` selects whichever country happens to share
 * that number.
 */
export type SearchSelection =
  | { kind: "country"; countryIdx: number; panTo: number }
  | { kind: "location"; locationIdx: number; panTo: number };

export function resolveSearchSelection(result: SearchResult): SearchSelection {
  if (result.kind === "country") {
    return { kind: "country", countryIdx: result.id, panTo: result.locationIdx };
  }
  return { kind: "location", locationIdx: result.locationIdx, panTo: result.locationIdx };
}
