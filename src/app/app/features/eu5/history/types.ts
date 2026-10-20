import type { WorldSummary } from "@/wasm/wasm_eu5";
import type { SaveSnapshot } from "@/wasm/wasm_eu5";

export type Snapshot = SaveSnapshot & {
  hash: string;
  fileName: string;
  marketLabels: Record<string, string>;
};

export type SnapshotMetadata = Omit<Snapshot, "countries" | "markets"> & {
  world?: WorldSummary;
  layoutKey?: string;
};
