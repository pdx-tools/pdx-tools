import type { SaveSnapshot } from "@/wasm/wasm_eu5";

export type Snapshot = SaveSnapshot & {
  hash: string;
  fileName: string;
  marketLabels: Record<string, string>;
};

export const campaignKey = (s: Snapshot) => `${s.campaignId}:${s.version}`;
