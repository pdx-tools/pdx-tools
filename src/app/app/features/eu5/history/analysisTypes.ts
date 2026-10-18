export type MapProjection = {
  layoutKey: string;
  locationIds: Uint32Array<ArrayBuffer>;
  fractions: Uint16Array<ArrayBuffer>;
  metrics: Float32Array<ArrayBuffer>;
  controllers: Uint32Array<ArrayBuffer>;
  religions: Uint32Array<ArrayBuffer>;
  markets: Uint32Array<ArrayBuffer>;
  religionColors: Uint32Array<ArrayBuffer>;
  marketColors: Uint32Array<ArrayBuffer>;
  owners: Uint32Array<ArrayBuffer>;
  countries: Uint32Array<ArrayBuffer>;
};
import type { WorldSummary } from "@/wasm/wasm_eu5";
export type MapObservation = {
  hash: string;
  campaignId: string;
  date: string;
  dateSort: number;
  version: string;
  layoutKey: string;
  fileName: string;
  world: WorldSummary;
};
export type MapFrame = MapProjection & MapObservation;

/** The country and market tables of a snapshot. See `eu5app::snapshot`. */
export type SnapshotTables = {
  strings: string[];
  countryMetrics: string[];
  marketMetrics: string[];
  countryIds: Uint32Array<ArrayBuffer>;
  countryTags: Uint32Array<ArrayBuffer>;
  countryLocations: Uint32Array<ArrayBuffer>;
  countryValues: Float64Array<ArrayBuffer>;
  breakdownOffsets: Uint32Array<ArrayBuffer>;
  breakdownKeys: Uint32Array<ArrayBuffer>;
  breakdownValues: Float32Array<ArrayBuffer>;
  countryMarketOffsets: Uint32Array<ArrayBuffer>;
  countryMarkets: Uint32Array<ArrayBuffer>;
  marketCenters: Uint32Array<ArrayBuffer>;
  marketCenterNames: Uint32Array<ArrayBuffer>;
  marketGoods: Uint32Array<ArrayBuffer>;
  marketValues: Float32Array<ArrayBuffer>;
};

export type SaveAnalysis = {
  observation: MapObservation;
  projection: MapProjection;
  tables: SnapshotTables;
};
export type AnalysisDescriptor = MapObservation;
