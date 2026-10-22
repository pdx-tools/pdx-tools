import type { QueryContext } from "@/features/campaign/analysis/session";
import type { Eu5AnalysisStore } from "@/wasm/wasm_eu5";

type Context = QueryContext<Eu5AnalysisStore>;

/** The EU5 history queries. The Rust store of the analysis worker answers them. */
export const eu5Queries = {
  /** A snapshot that does not have one of the locations gives a gap. */
  locationPopulation: ({ store, campaignId, selection }: Context, locationIds: readonly number[]) =>
    store.location_population(campaignId, selection, Uint32Array.from(locationIds)),
  worldPopulation: ({ store, campaignId, selection }: Context, _args: null) =>
    store.world_population(campaignId, selection),
};

export type Eu5Queries = typeof eu5Queries;
