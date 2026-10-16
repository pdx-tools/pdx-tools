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
import type { PackedSnapshot } from "./packedSnapshot";
import type { PackedOverviews } from "./packedOverview";
import type { SnapshotMetadata } from "./types";
export type SaveAnalysis = MapSaveAnalysis & {
  snapshot: PackedSnapshot;
  projection: MapProjection;
  overviews: PackedOverviews;
  countryIds: Uint32Array<ArrayBuffer>;
  countryNames: Record<string, string>;
};
export type AnalysisDescriptor = MapObservation &
  SnapshotMetadata & {
    layoutKey: string;
    countryNames: Record<string, string>;
    goods: string[];
  };
export type HistoryQuery = {
  campaignId: string;
  country?: string;
  good?: string;
  centers?: number[];
};
export type AnalysisEntity = { kind: "country" | "market" | "location"; id: number };

import type { WorldSummary } from "@/wasm/wasm_eu5";
export type MapObservation = {
  hash: string;
  campaignId: string;
  layoutKey: string;
  date: string;
  dateSort: number;
  version: string;
  fileName: string;
  world: WorldSummary;
};
export type MapFrame = MapProjection & MapObservation;
export type MapSaveAnalysis = { observation: MapObservation; projection: MapProjection };
