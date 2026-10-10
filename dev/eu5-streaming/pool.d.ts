import type { Snapshot } from "../../src/app/app/features/eu5/history/types";
export type StreamMetrics = {
  milliseconds: number;
  wasmBytes: number;
  inputBufferBytes: number;
  bytesRead: number;
};
export function importSnapshots(
  files: File[] | FileList,
  options?: {
    concurrency?: number;
    parserBudgetMiB?: number;
    estimatedWorkerMiB?: number;
    chunkSize?: number;
    algorithm?: "sha256" | "blake3";
    retainSnapshots?: boolean;
    signal?: AbortSignal;
    onSnapshot?: (snapshot: Snapshot, file: File, metrics: StreamMetrics) => Promise<void> | void;
    onProgress?: (progress: { completed: number; total: number; fileName: string }) => void;
  },
): Promise<{
  snapshots: Snapshot[];
  errors: { fileName: string; error: string }[];
  metrics: StreamMetrics[];
  workers: number;
}>;
