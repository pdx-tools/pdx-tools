import type { MapObservation } from "./analysisTypes";
import type { SaveSnapshot } from "@/wasm/wasm_eu5";

export type Snapshot = SaveSnapshot & {
  hash: string;
  fileName: string;
  marketLabels: Record<string, string>;
};

export const campaignKey = (s: Pick<Snapshot, "campaignId">) => s.campaignId;

export type SnapshotMetadata = Omit<Snapshot, "countries" | "markets"> &
  Partial<Pick<MapObservation, "world" | "layoutKey">>;
