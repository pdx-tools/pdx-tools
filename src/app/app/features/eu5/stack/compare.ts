import type { LocationRow, LocationStats, MapMode } from "@/wasm/wasm_eu5";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";

/**
 * The modes that colour the land of each country by one quantity. The
 * caption of one such country lists its locations by that quantity.
 */
export function isCountryMode(mode: MapMode): boolean {
  switch (mode) {
    case "political":
    case "control":
    case "development":
    case "stateEfficacy":
    case "wealth":
    case "unrealizedTaxBase":
    case "population":
    case "populationGrowth":
      return true;
    default:
      return false;
  }
}

/** A country's profile, or nothing without a country */
export function useCountryProfile(countryIdx: number | null) {
  return useEu5Trigger(
    (engine) =>
      countryIdx === null ? Promise.resolve(null) : engine.queries.getCountryProfile(countryIdx),
    [countryIdx],
  ).data;
}

/** The value that the mode gives one location of a country, or null */
export function locationRowValue(row: LocationRow, mode: MapMode): number | null {
  switch (mode) {
    case "control":
      return row.control;
    case "development":
      return row.development;
    case "stateEfficacy":
      return row.control * row.development;
    case "wealth":
      return row.wealth;
    case "unrealizedTaxBase":
      return row.wealth - row.taxBase;
    case "population":
      return row.population;
    default:
      return null;
  }
}

/** The value of one location on the mode's scale, to mark on the legend */
export function locationStatValue(
  stats: LocationStats,
  buildingLevels: number,
  mode: MapMode,
): number | undefined {
  switch (mode) {
    case "control":
      return stats.control;
    case "development":
      return stats.development;
    case "stateEfficacy":
      return stats.control * stats.development;
    case "wealth":
      return stats.wealth;
    case "unrealizedTaxBase":
      return stats.wealth - stats.taxBase;
    case "population":
      return stats.population;
    case "rgoLevel":
      return stats.rgoLevel;
    case "buildingLevels":
      return buildingLevels;
    default:
      return undefined;
  }
}
