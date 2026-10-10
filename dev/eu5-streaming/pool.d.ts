import type { Snapshot } from "../../src/app/app/features/eu5/history/types";
export function importSnapshots(
  files: File[] | FileList,
  options?: {
    concurrency?: number;
    parserBudgetMiB?: number;
    estimatedWorkerMiB?: number;
    chunkSize?: number;
    signal?: AbortSignal;
    onSnapshot?: (snapshot: Snapshot, file: File) => Promise<void> | void;
    onProgress?: (progress: { completed: number; total: number; fileName: string }) => void;
  },
): Promise<{
  errors: { fileName: string; error: string }[];
}>;
