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

/**
 * How well a result fits the query: an exact tag or player's name, then a name that
 * starts with it, then the rest
 */
function searchTier(
  query: string,
  result: { name: string; tag?: string; player?: string },
): number {
  if (result.tag?.toLowerCase() === query || result.player?.toLowerCase() === query) return 0;
  return result.name.toLowerCase().startsWith(query) ||
    result.player?.toLowerCase().startsWith(query)
    ? 1
    : 2;
}

/**
 * The results in order of fit for a query in lower case. In one tier a shorter
 * name comes first, because it is the nearer match, and then the alphabet.
 */
export function rankSearchResults<T extends { name: string; tag?: string; player?: string }>(
  query: string,
  results: readonly T[],
): T[] {
  return results
    .map((result) => ({ result, tier: searchTier(query, result) }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.result.name.length - b.result.name.length ||
        a.result.name.localeCompare(b.result.name),
    )
    .map((x) => x.result);
}
