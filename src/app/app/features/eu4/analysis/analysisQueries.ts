import type { QueryContext } from "@/features/campaign/analysis/session";
import type { Eu4AnalysisStore } from "@/wasm/wasm_eu4";

type Context = QueryContext<Eu4AnalysisStore>;

/** The EU4 history queries. The Rust store of the analysis worker answers them. */
export const eu4Queries = {
  /** A snapshot that does not have one of the provinces gives a gap. */
  provinceDevelopment: (
    { store, campaignId, selection }: Context,
    provinceIds: readonly number[],
  ) => store.province_development(campaignId, selection, Uint32Array.from(provinceIds)),
  worldDevelopment: ({ store, campaignId, selection }: Context, _args: null) =>
    store.world_development(campaignId, selection),
};

export type Eu4Queries = typeof eu4Queries;
