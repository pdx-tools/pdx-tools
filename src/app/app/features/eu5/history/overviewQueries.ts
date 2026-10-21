import type { SaveQueries } from "../game-adapter";
import type { OverviewData } from "@/wasm/wasm_eu5";
import { queryAnalysisOverview } from "./analysisClient";

const overviews = {
  getStateEfficacy: "stateEfficacy",
  getDevelopmentInsight: "development",
  getWealthInsight: "wealth",
  getWealthScope: "wealthScope",
  getUnrealizedTaxBaseInsight: "unrealizedTaxBase",
  getUnrealizedTaxBaseScope: "unrealizedTaxBaseScope",
  getMarketInsight: "markets",
  getPopulationInsight: "population",
  getPopulationGrowthInsight: "populationGrowth",
  getBuildingLevelsInsight: "buildingLevels",
  getReligionInsight: "religion",
  getRgoInsight: "rgoLevel",
  getControlInsight: "control",
  getPoliticalWorldScoreboard: "political",
} as const satisfies Partial<Record<keyof SaveQueries, keyof OverviewData>>;

/** Only overview charts read analytical columns; the engine keeps its live-save queries. */
export function overviewQueries(live: SaveQueries, hash: string): SaveQueries {
  return new Proxy(live, {
    get: (target, key) => {
      if (typeof key !== "string" || !Object.hasOwn(overviews, key))
        return Reflect.get(target, key);
      return async () => {
        const result = await queryAnalysisOverview(hash, overviews[key as keyof typeof overviews]);
        if (result.hash !== hash) throw new DOMException("Observation changed", "AbortError");
        return result.data;
      };
    },
  });
}
