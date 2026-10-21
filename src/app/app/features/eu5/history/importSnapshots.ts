import { createWorkerQueue } from "@/lib/workerQueue";
import type { WorkerQueue } from "@/lib/workerQueue";
import { appendAnalysis, campaignAnalysis } from "./analysisClient";
import { MEMORY_LIMIT_ERROR } from "@/features/campaign/analysis/residentStore";
import type { Eu5SnapshotDescriptor } from "./analysisTypes";
import type { ImportPhaseState } from "./importTiming";
import type { parseImport } from "./snapshot-worker";
export type ImportOptions = {
  signal: AbortSignal;
  concurrency?: number;
  onSnapshots: (
    snapshots: Eu5SnapshotDescriptor[],
    sources: { snapshot: Eu5SnapshotDescriptor; file: File }[],
  ) => void;
  onProgress: (
    completed: number,
    total: number,
    fileName: string,
    phase?: ImportPhaseState,
  ) => void;
  /** Files currently assigned to parser workers, including analytical publication. */
  onActiveFiles?: (files: readonly File[]) => void;
  /** Preserve file identity for status display, even when names are duplicated. */
  onFileError?: (file: File, error: string) => void;
};
/** Stream normal-parser output into one resident analysis worker, without disk writes. */
export async function importTimeline(files: File[], options: ImportOptions) {
  const { signal } = options;
  type Api = { parseImport: typeof parseImport };
  const queues: WorkerQueue<Api>[] = [];
  const active = new Set<File>();
  const abortError = () => new DOMException("Import stopped", "AbortError");
  let stopping = false,
    completed = 0,
    next = 0,
    sinkFailure: unknown,
    memoryFull: string | null = null,
    refused = 0;
  const abort = () => {
    stopping = true;
    for (const queue of queues) queue.terminate(abortError());
  };
  signal.addEventListener("abort", abort, { once: true });
  const errors: { fileName: string; error: string }[] = [],
    jobs: File[] = [];
  let phase: ImportPhaseState = {
    phase: "import",
    completed: 0,
    total: files.length,
    startedAt: performance.now(),
  };
  const progress = (fileName: string) => {
    phase = { ...phase, completed: ++completed };
    options.onProgress(completed, files.length, fileName, phase);
  };
  try {
    signal.throwIfAborted();
    for (const file of files) {
      signal.throwIfAborted();
      if (!file.name.toLowerCase().endsWith(".eu5")) {
        errors.push({ fileName: file.name, error: "Not an EU5 save" });
        options.onFileError?.(file, "Not an EU5 save");
        progress(file.name);
        continue;
      }
      jobs.push(file);
    }
    const residentMiB = (await campaignAnalysis().memory()).bufferBytes / 1024 ** 2;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const budgetMiB = memory * 1024 * 0.65 - 512;
    const largest = jobs.reduce((size, file) => Math.max(size, 768 + file.size / 1024 ** 2), 768);
    const capacityFor = (resident: number) =>
      Math.max(
        1,
        Math.min(
          jobs.length,
          Math.max(1, Math.min(8, options.concurrency ?? 8)),
          Math.floor((budgetMiB - resident) / largest),
        ),
      );
    const count = capacityFor(residentMiB);
    let capacity = count;
    phase = { ...phase, concurrency: count };
    options.onProgress(completed, files.length, "Importing campaign analysis…", phase);
    await Promise.all(
      Array.from({ length: count }, async (_, lane) => {
        const queue = createWorkerQueue<Api>(
          () => new Worker(new URL("./snapshot-worker.ts", import.meta.url), { type: "module" }),
          { idleMs: 0, timeoutMs: 300_000 },
        );
        queues.push(queue);
        while (next < jobs.length && !stopping && !memoryFull && lane < capacity) {
          signal.throwIfAborted();
          const file = jobs[next++];
          active.add(file);
          options.onActiveFiles?.([...active]);
          try {
            await queue.run(
              async (parser, taskSignal) => {
                const result = await parser.parseImport(file);
                taskSignal.throwIfAborted();
                signal.throwIfAborted();
                // Waiting for append bounds unwritten analytical output to the active parser count.
                const { descriptor } = await appendAnalysis(result);
                // Once append succeeds the observation is committed, even if cancellation
                // arrived while the worker was accepting it. Publish that committed result.
                try {
                  options.onSnapshots([descriptor], [{ snapshot: descriptor, file }]);
                } catch (error) {
                  sinkFailure = error;
                  abort();
                  throw error;
                }
                if (!signal.aborted) {
                  capacity = capacityFor(
                    (await campaignAnalysis().memory()).bufferBytes / 1024 ** 2,
                  );
                  phase = { ...phase, concurrency: capacity };
                }
              },
              { signal, label: `analysis of ${file.name}` },
            );
          } catch (error) {
            if (sinkFailure) throw sinkFailure;
            signal.throwIfAborted();
            if (error instanceof Error && error.name === MEMORY_LIMIT_ERROR) {
              // More saves cannot fit, so do not parse them.
              memoryFull ??= error.message;
              refused++;
            } else {
              errors.push({ fileName: file.name, error: String(error) });
              options.onFileError?.(file, String(error));
            }
          } finally {
            active.delete(file);
            options.onActiveFiles?.([...active]);
          }
          progress(file.name);
        }
      }),
    );
    if (sinkFailure) throw sinkFailure;
    refused += jobs.length - next;
    return {
      errors,
      completed: files.length,
      memoryFull: memoryFull && { message: memoryFull, refused },
    };
  } finally {
    abort();
    signal.removeEventListener("abort", abort);
  }
}
