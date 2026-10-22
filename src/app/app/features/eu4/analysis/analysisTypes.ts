import type { SnapshotDescriptor } from "@/features/campaign/analysis/descriptor";
import type { ResidentSnapshot } from "@/features/campaign/analysis/session";

/** Equal to `eu4game::analysis::EXTRACTOR_VERSION`. The store refuses other versions. */
export const EU4_EXTRACTOR_VERSION = 1;

/** One row for each province, in province ID order. */
export type ProvinceColumns = {
  layoutKey: string;
  provinceIds: Uint32Array<ArrayBuffer>;
  development: Float32Array<ArrayBuffer>;
  /** 1 when a country owns the province, else 0. */
  owned: Uint8Array<ArrayBuffer>;
};

/** An EU4 snapshot. The layout key identifies the province IDs. */
export type Eu4SnapshotDescriptor = SnapshotDescriptor & { game: "eu4"; layoutKey: string };

export type Eu4Payload = { provinces: ProvinceColumns };

export type Eu4SaveAnalysis = ResidentSnapshot<Eu4SnapshotDescriptor, Eu4Payload>;
