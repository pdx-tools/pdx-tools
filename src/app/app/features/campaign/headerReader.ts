import { wrap } from "comlink";
import type { Remote } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";
import type * as HeaderModule from "./headerWorker/module";
import type { CampaignGame, SaveHeader } from "./types";

/**
 * A worker that has nothing to read for this long ends. Wasm memory does
 * not shrink, so the end of the worker frees what the largest file took.
 */
const IDLE_MS = 10_000;

/**
 * A read that takes longer than this fails, and its worker ends. A worker
 * that crashed never answers, and it must not stop the reads after it.
 */
const READ_TIMEOUT_MS = 60_000;

type HeaderWorker = { raw: Worker; api: Remote<typeof HeaderModule> };

type Job = {
  game: CampaignGame;
  file: File;
  resolve: (header: SaveHeader) => void;
  reject: (error: unknown) => void;
};

/**
 * The header reads run one at a time in a worker of their own, apart from
 * the worker of the open save. Thus a read does not wait for a parse, and
 * the end of an analysis does not stop a read.
 */
const reads = {
  jobs: [] as Job[],
  running: false,
  worker: null as HeaderWorker | null,
  idle: null as ReturnType<typeof setTimeout> | null,
};

/**
 * Read the campaign and date of a save file, without loading map assets.
 * An urgent read, such as the check of a file before a step to
 * it, goes before the reads that wait.
 */
export function readSaveHeader(
  game: CampaignGame,
  file: File,
  { urgent = false }: { urgent?: boolean } = {},
): Promise<SaveHeader> {
  return new Promise((resolve, reject) => {
    const job = { game, file, resolve, reject };
    if (urgent) reads.jobs.unshift(job);
    else reads.jobs.push(job);
    void drain();
  });
}

async function drain(): Promise<void> {
  if (reads.running) return;
  reads.running = true;
  if (reads.idle !== null) {
    clearTimeout(reads.idle);
    reads.idle = null;
  }

  try {
    for (let job = reads.jobs.shift(); job !== undefined; job = reads.jobs.shift()) {
      try {
        job.resolve(await read(job));
      } catch (error) {
        job.reject(error);
      }
    }
  } finally {
    reads.running = false;
    reads.idle = setTimeout(stopWorker, IDLE_MS);
  }
}

async function read({ game, file }: Job): Promise<SaveHeader> {
  const worker = (reads.worker ??= startWorker());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      stopWorker();
      reject(new Error(`no header from ${file.name} after ${READ_TIMEOUT_MS} ms`));
    }, READ_TIMEOUT_MS);
  });

  try {
    return await Promise.race([worker.api.readSaveHeader(game, file), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function startWorker(): HeaderWorker {
  const raw = new Worker(new URL("./headerWorker/worker.ts", import.meta.url), {
    type: "module",
  });
  trackWorker(raw);
  return { raw, api: wrap<typeof HeaderModule>(raw) };
}

function stopWorker(): void {
  reads.idle = null;
  reads.worker?.raw.terminate();
  reads.worker = null;
}
