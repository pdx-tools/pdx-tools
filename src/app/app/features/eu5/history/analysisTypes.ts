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
export type SaveAnalysis = { observation: MapObservation; projection: MapProjection };
export type AnalysisDescriptor = MapObservation;
