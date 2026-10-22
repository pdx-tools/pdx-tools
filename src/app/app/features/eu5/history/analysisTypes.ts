import type { SnapshotDescriptor } from "@/features/campaign/analysis/descriptor";
import type { ResidentSnapshot } from "@/features/campaign/analysis/residentStore";
import type { WorldSummary } from "@/wasm/wasm_eu5";

/** Equal to `eu5app::map_projection::EXTRACTOR_VERSION`. The store refuses other versions. */
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

export type Eu5Payload = { projection: MapProjection };

/** The parser output for one save. */
export type SaveAnalysis = ResidentSnapshot<Eu5SnapshotDescriptor, Eu5Payload>;
