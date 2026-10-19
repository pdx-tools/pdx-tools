import type { SnapshotDescriptor } from "@/features/campaign/analysis/descriptor";
import type { WorldSummary } from "@/wasm/wasm_eu5";

/** Equal to `eu5app::snapshot::EXTRACTOR_VERSION`. The store refuses other versions. */
export const EU5_EXTRACTOR_VERSION = 1;

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

/** An EU5 snapshot. The layout key identifies the map artifact. */
export type Eu5SnapshotDescriptor = SnapshotDescriptor & {
  game: "eu5";
  layoutKey: string;
  world: WorldSummary;
};
/** What a game worker reads to paint a snapshot. */
export type MapFrame = { descriptor: Eu5SnapshotDescriptor; projection: MapProjection };

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

export type Eu5Payload = { projection: MapProjection; tables: SnapshotTables };

/** The parser output for one save. */
export type SaveAnalysis = { descriptor: Eu5SnapshotDescriptor; payload: Eu5Payload };
