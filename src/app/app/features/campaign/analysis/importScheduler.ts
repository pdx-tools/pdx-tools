import type { Remote } from "comlink";
import { createWorkerQueue } from "@/lib/workerQueue";
import type { WorkerQueue } from "@/lib/workerQueue";
import { parserAdmission } from "./admission";
import type { ParserAdmission } from "./admission";
import type { SnapshotDescriptor } from "./descriptor";
import { MEMORY_LIMIT_ERROR } from "./residentStore";
import type { AppendResult } from "./residentStore";
import { STALE_GENERATION_ERROR } from "./session";

/** The game rules to parse a save in a background worker. */
export type ParserAdapter<Api, R> = {
  /** The reason that this parser cannot read the file, or null. */
  refuse: (file: File) => string | null;
  /** Construct the worker with new Worker(new URL(...)) so the bundler can find it. */
  start: () => Worker;
  parse: (api: Remote<Api>, file: File) => Promise<R>;
  /** A high estimate of the memory that one parse uses, in bytes. */
  peakBytes: (file: File) => number;
};

/** The analysis session that keeps the parser output. */
export type AnalysisSink<R, D> = {
  generation: () => number;
  append: (generation: number, result: R) => Promise<AppendResult<D>>;
  /** Read the resident bytes again and give them to the parser admission. */
  refreshResident: () => Promise<void>;
};

/** What happened to an input file. Each file has one outcome. */
export type ImportOutcome =
  | "accepted"
  | "duplicate"
  | "failed"
  | "refused"
  | "unprocessed"
  | "cancelled";

export type ImportProgress = {
  completed: number;
  total: number;
  fileName: string;
  /** The number of files that parsers have now. */
  active: number;
};

export type ImportOptions<D> = {
  signal: AbortSignal;
  /** The maximum number of parsers for this batch. */
  concurrency?: number;
  admission?: ParserAdmission;
  /** Called for each stored snapshot, also after cancellation. */
  onCommitted: (descriptor: D, file: File) => void;
  onProgress?: (progress: ImportProgress) => void;
  onActiveFiles?: (files: readonly File[]) => void;
};

export type ImportResult = {
  outcomes: Record<ImportOutcome, number>;
  failures: { fileName: string; error: string }[];
  /** The memory refusal message, if the store became full. */
  memoryFull: string | null;
};

const IDLE_MS = 60_000;
const TIMEOUT_MS = 300_000;

/**
 * Parse saves in background workers and append each result to a session. A
 * parser waits for its append before it starts the next file, so stored output
 * waits for at most one append per parser.
 *
 * A memory refusal stops new parses. Cancellation stops parses, but a snapshot
 * that an append stored is published. A clear of the session stops the batch.
 */
export async function importBatch<Api, R, D extends SnapshotDescriptor>(
  files: readonly File[],
  parser: ParserAdapter<Api, R>,
  sink: AnalysisSink<R, D>,
  options: ImportOptions<D>,
): Promise<ImportResult> {
  const { signal } = options;
  const admission = options.admission ?? parserAdmission();
  const generation = sink.generation();
  const outcomes: (ImportOutcome | undefined)[] = Array(files.length);
  const failures: ImportResult["failures"] = [];
  const active = new Set<File>();
  const queues: WorkerQueue<Api>[] = [];
  const stop = new AbortController();
  let memoryFull: string | null = null;
  let publishFailure: { error: unknown } | undefined;
  let completed = 0;

  const abort = () => {
    stop.abort(signal.reason);
    for (const queue of queues) queue.terminate(signal.reason);
  };
  if (signal.aborted) stop.abort(signal.reason);
  else signal.addEventListener("abort", abort, { once: true });
  const finish = (index: number, outcome: ImportOutcome, error?: unknown) => {
    outcomes[index] = outcome;
    if (outcome === "failed") failures.push({ fileName: files[index].name, error: String(error) });
    completed++;
    options.onProgress?.({
      completed,
      total: files.length,
      fileName: files[index].name,
      active: active.size,
    });
  };
  const setActive = (file: File, on: boolean) => {
    if (on) active.add(file);
    else active.delete(file);
    options.onActiveFiles?.([...active]);
  };

  const jobs: number[] = [];
  files.forEach((file, index) => {
    const reason = parser.refuse(file);
    if (reason) finish(index, "failed", reason);
    else jobs.push(index);
  });

  let next = 0;
  const lane = async () => {
    const queue = createWorkerQueue<Api>(parser.start, {
      idleMs: IDLE_MS,
      timeoutMs: TIMEOUT_MS,
    });
    queues.push(queue);
    while (!stop.signal.aborted && next < jobs.length) {
      const index = jobs[next++];
      const file = files[index];
      let release: () => void;
      try {
        release = await admission.acquire(parser.peakBytes(file), stop.signal);
      } catch {
        // The batch stopped. The end of the batch sets the outcome.
        return;
      }
      setActive(file, true);
      try {
        let result: R;
        try {
          result = await queue.run((api) => parser.parse(api, file), {
            signal,
            label: `analysis of ${file.name}`,
          });
        } catch (error) {
          finish(index, signal.aborted ? "cancelled" : "failed", error);
          continue;
        }
        if (signal.aborted || sink.generation() !== generation) {
          finish(index, "cancelled");
          stop.abort();
          continue;
        }
        let stored: AppendResult<D>;
        try {
          stored = await sink.append(generation, result);
        } catch (error) {
          const name = error instanceof Error ? error.name : "";
          if (name === MEMORY_LIMIT_ERROR) {
            memoryFull ??= (error as Error).message;
            stop.abort();
            finish(index, "refused");
          } else if (name === STALE_GENERATION_ERROR || sink.generation() !== generation) {
            stop.abort();
            finish(index, "cancelled");
          } else finish(index, "failed", error);
          continue;
        }
        finish(index, stored.duplicate ? "duplicate" : "accepted");
        try {
          options.onCommitted(stored.descriptor, file);
        } catch (error) {
          publishFailure ??= { error };
          abort();
        }
        await sink.refreshResident().catch(() => {});
      } finally {
        setActive(file, false);
        release();
      }
    }
  };

  try {
    const lanes = Math.max(1, Math.min(jobs.length, options.concurrency ?? 8));
    await Promise.all(Array.from({ length: jobs.length ? lanes : 0 }, lane));
  } finally {
    signal.removeEventListener("abort", abort);
    for (const queue of queues) queue.terminate();
  }
  if (publishFailure) throw publishFailure.error;

  const counts: Record<ImportOutcome, number> = {
    accepted: 0,
    duplicate: 0,
    failed: 0,
    refused: 0,
    unprocessed: 0,
    cancelled: 0,
  };
  // A file without an outcome did not start. A full store leaves it unprocessed.
  const rest: ImportOutcome = memoryFull && !signal.aborted ? "unprocessed" : "cancelled";
  for (const outcome of outcomes) counts[outcome ?? rest]++;
  return { outcomes: counts, failures, memoryFull };
}
