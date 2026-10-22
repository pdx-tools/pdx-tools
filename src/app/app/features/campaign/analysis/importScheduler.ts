import type { Remote } from "comlink";
import { createWorkerQueue } from "@/lib/workerQueue";
import type { ImportLease } from "./admission";
import type { SnapshotDescriptor } from "./descriptor";
import { MEMORY_LIMIT_ERROR } from "./residentStore";
import type { AppendResult } from "./residentStore";
import { STALE_GENERATION_ERROR } from "./session";

/** The game rules to parse a save in a background worker. */
export type ParserAdapter<Api, R> = {
  /** The reason that this parser cannot read the file, or null. */
  refuse: (file: File) => string | null;
  /**
   * Construct the worker with new Worker(new URL(...)) so the bundler can
   * find it. The worker loads the assets that the game needs.
   */
  start: () => Worker;
  parse: (api: Remote<Api>, file: File) => Promise<R>;
  /** A high estimate of the memory of a parser worker for this file, in bytes. */
  peakBytes: (file: File) => number;
};

/** The analysis session that keeps the parser output. */
export type AnalysisSink<R, D> = {
  generation: () => number;
  /** Aborts when the session clears or its worker stops. */
  signal: () => AbortSignal;
  append: (generation: number, output: R, lease: ImportLease) => Promise<AppendResult<D>>;
};

/** What happened to an input file. Each file has one outcome. */
export type ImportOutcome =
  /** The session stored a new snapshot. */
  | "accepted"
  /** The session already had this snapshot. */
  | "duplicate"
  | "failed"
  /** The session had no memory for the snapshot. */
  | "refused"
  /** The import stopped on a full session before it parsed the file. */
  | "unprocessed"
  | "cancelled";

export type ImportProgress = {
  completed: number;
  total: number;
  fileName: string;
  /** The number of files that parsers have now. */
  active: number;
};

export type ImportOptions<D, R = unknown> = {
  signal: AbortSignal;
  /** The tab-wide import lease. The caller releases it after the batch. */
  lease: ImportLease;
  /** The maximum number of parsers for this batch. */
  concurrency?: number;
  /**
   * The reason that the session must not keep this parser output, or null.
   * The file then fails with this reason, and the session does not get it.
   */
  refuseOutput?: (output: R, file: File) => string | null;
  /** Called for each stored snapshot, also after cancellation. */
  onCommitted: (descriptor: D, file: File) => void;
  onProgress?: (progress: ImportProgress) => void;
  onActiveFiles?: (files: readonly File[]) => void;
  /**
   * Called when a file gets its outcome, with the reason of a failure. A file
   * that the batch did not start gets no call.
   */
  onFileOutcome?: (file: File, outcome: ImportOutcome, error?: string) => void;
};

export type ImportResult = {
  /** The outcome of each input file, in input order. */
  files: ImportOutcome[];
  outcomes: Record<ImportOutcome, number>;
  failures: { fileName: string; error: string }[];
  /** The memory refusal message, if the session became full. */
  memoryFull: string | null;
};

const TIMEOUT_MS = 300_000;

/**
 * Parse saves in background workers and append each result to a session.
 *
 * A parser waits for its append before it starts the next file, so output
 * that waits for storage is at most one result for each parser. A parser
 * worker keeps its memory while it lives, because WASM memory does not
 * shrink. Resident data only grows during the batch, so the parsers that fit
 * only become fewer. A parser that no longer fits stops its worker. One
 * parser can always run.
 *
 * A memory refusal stops new parses. Active parses continue and try to append.
 * Cancellation stops all parses, but a snapshot that an append stored is
 * published. A clear of the session stops the batch and publishes nothing more.
 */
export async function importBatch<Api, R, D extends SnapshotDescriptor>(
  files: readonly File[],
  parser: ParserAdapter<Api, R>,
  sink: AnalysisSink<R, D>,
  options: ImportOptions<D, R>,
): Promise<ImportResult> {
  const { lease } = options;
  const generation = sink.generation();
  // Stops all parses when a consumer throws.
  const halt = new AbortController();
  const signal = AbortSignal.any([options.signal, sink.signal(), halt.signal]);
  // Stops new parses. A memory refusal sets it, but active parses continue.
  const stop = new AbortController();
  const outcomes: (ImportOutcome | undefined)[] = Array(files.length);
  const failures: ImportResult["failures"] = [];
  const active = new Set<File>();
  let memoryFull: string | null = null;
  let publishFailure: { error: unknown } | undefined;
  let completed = 0;

  const onAbort = () => stop.abort(signal.reason);
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });

  /** Call a consumer. If it throws, stop the batch and throw its error at the end. */
  const notify = (call: () => void) => {
    try {
      call();
    } catch (error) {
      publishFailure ??= { error };
      halt.abort(error);
    }
  };
  const finish = (index: number, outcome: ImportOutcome, error?: unknown) => {
    outcomes[index] = outcome;
    const reason = outcome === "failed" ? String(error) : undefined;
    if (reason !== undefined) failures.push({ fileName: files[index].name, error: reason });
    completed++;
    notify(() => options.onFileOutcome?.(files[index], outcome, reason));
    notify(() =>
      options.onProgress?.({
        completed,
        total: files.length,
        fileName: files[index].name,
        active: active.size,
      }),
    );
  };
  const setActive = (file: File, on: boolean) => {
    if (on) active.add(file);
    else active.delete(file);
    notify(() => options.onActiveFiles?.([...active]));
  };

  const jobs: number[] = [];
  files.forEach((file, index) => {
    const reason = parser.refuse(file);
    if (reason) finish(index, "failed", reason);
    else jobs.push(index);
  });

  // Each parser has the largest peak of the batch, so it does not grow between files.
  const peakBytes = Math.max(0, ...jobs.map((index) => parser.peakBytes(files[index])));
  const fits = (parsers: number) => parsers <= 1 || lease.parsersFit(parsers, peakBytes);
  let lanes = 0;
  let next = 0;
  const lane = async () => {
    const queue = createWorkerQueue<Api>(parser.start, {
      // The lane terminates the worker. It does not stop while idle.
      idleMs: TIMEOUT_MS,
      timeoutMs: TIMEOUT_MS,
    });
    try {
      while (!stop.signal.aborted && next < jobs.length) {
        // The resident data can grow, so a parser that no longer fits stops.
        if (!fits(lanes)) return;
        const index = jobs[next++];
        const file = files[index];
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
          if (signal.aborted) {
            finish(index, "cancelled");
            continue;
          }
          let refused: string | null | undefined;
          notify(() => (refused = options.refuseOutput?.(result, file)));
          if (refused || halt.signal.aborted) {
            finish(index, refused ? "failed" : "cancelled", refused);
            continue;
          }
          let stored: AppendResult<D>;
          try {
            stored = await sink.append(generation, result, lease);
          } catch (error) {
            const name = error instanceof Error ? error.name : "";
            if (name === MEMORY_LIMIT_ERROR) {
              memoryFull ??= (error as Error).message;
              stop.abort();
              finish(index, "refused");
            } else if (name === STALE_GENERATION_ERROR || sink.generation() !== generation) {
              finish(index, "cancelled");
            } else finish(index, "failed", error);
            continue;
          }
          finish(index, stored.duplicate ? "duplicate" : "accepted");
          notify(() => options.onCommitted(stored.descriptor, file));
        } finally {
          setActive(file, false);
        }
      }
    } finally {
      lanes--;
      queue.terminate();
    }
  };

  try {
    let start = Math.min(jobs.length, options.concurrency ?? 8);
    while (start > 1 && !fits(start)) start--;
    lanes = start;
    await Promise.all(Array.from({ length: start }, lane));
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  if (publishFailure) throw publishFailure.error;

  // A file without an outcome did not start. A full session leaves it unprocessed.
  const rest: ImportOutcome = memoryFull && !signal.aborted ? "unprocessed" : "cancelled";
  const counts: Record<ImportOutcome, number> = {
    accepted: 0,
    duplicate: 0,
    failed: 0,
    refused: 0,
    unprocessed: 0,
    cancelled: 0,
  };
  const result = Array.from(outcomes, (outcome) => outcome ?? rest);
  for (const outcome of result) counts[outcome]++;
  return { files: result, outcomes: counts, failures, memoryFull };
}
