import { wrap } from "comlink";
import { importSnapshots as streamSnapshots } from "../../../../../../dev/eu5-streaming/pool.js";
import { cachedHashAlias, cacheSnapshots, cacheHashAlias } from "./cache";
import { campaignKey, type Snapshot } from "./types";
import type { parseSnapshot, sha256File } from "./snapshot-worker";

export type ImportOptions = {
  signal: AbortSignal;
  existing: Snapshot[];
  concurrency?: number;
  preferredFile?: File;
  onSnapshots: (snapshots: Snapshot[], files: Record<string, File>) => void;
  onProgress: (completed: number, total: number, fileName: string) => void;
  onWarning: (warning: string) => void;
};

async function hasZipDirectory(file: File): Promise<boolean> {
  // Some saves claim text in the header but contain a ZIP. Mirror the normal
  // loader's footer check without reading the complete archive into memory.
  const footer = await file.slice(Math.max(0, file.size - 65557)).arrayBuffer();
  const view = new DataView(footer);
  for (let i = view.byteLength - 22; i >= 0; i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) <= view.byteLength
    )
      return true;
  }
  return false;
}

/** SHA identities remain valid; a BLAKE3 alias is recorded only after hashing identical bytes. */
export async function importTimeline(files: File[], options: ImportOptions) {
  const { signal } = options;
  const abortError = () => new DOMException("Import stopped", "AbortError");
  let legacyWorker: Worker | undefined;
  let legacyParser:
    | ReturnType<
        typeof wrap<{ parseSnapshot: typeof parseSnapshot; sha256File: typeof sha256File }>
      >
    | undefined;
  let legacyQueue = Promise.resolve();
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  // A handler exists even when the caller aborts during header inspection.
  void aborted.catch(() => {});
  const abort = () => {
    legacyWorker?.terminate();
    rejectAbort(abortError());
  };
  signal.addEventListener("abort", abort, { once: true });
  const identity = (s: Snapshot) => `${campaignKey(s)}:${s.dateSort}`;
  const occupied = new Map(options.existing.map((s) => [identity(s), s]));
  let completed = 0,
    cacheWarning = false;
  const warnCache = () => {
    if (!cacheWarning) {
      cacheWarning = true;
      options.onWarning("Browser cache could not be written; this session's charts still work.");
    }
  };
  function legacy<T>(
    run: (parser: NonNullable<typeof legacyParser>) => Promise<T>,
    recycle = false,
  ): Promise<T> {
    const job = legacyQueue.then(async () => {
      if (signal.aborted) throw abortError();
      if (!legacyParser) {
        legacyWorker = new Worker(new URL("./snapshot-worker.ts", import.meta.url), {
          type: "module",
        });
        legacyParser = wrap(legacyWorker);
      }
      try {
        return await Promise.race([run(legacyParser), aborted]);
      } finally {
        // WebCrypto can retain native input allocations until a worker exits.
        if (recycle) {
          legacyWorker?.terminate();
          legacyWorker = undefined;
          legacyParser = undefined;
        }
      }
    });
    legacyQueue = job.then(
      () => {},
      () => {},
    );
    return job;
  }
  type Pending = {
    snapshot: Snapshot;
    file: File;
    persist: boolean;
    resolve: () => void;
    reject: (error: unknown) => void;
  };
  let pending: Pending[] = [],
    timer: ReturnType<typeof setTimeout> | undefined;
  let writes = Promise.resolve();
  let unsettled = 0;
  let sinkFailure: unknown;
  function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const batch = pending;
    pending = [];
    if (!batch.length) return;
    writes = writes.then(async () => {
      try {
        if (signal.aborted) throw abortError();
        const attached: Record<string, File> = {};
        for (const item of batch) {
          // Duplicate byte-identical files must keep the viewer's active File object.
          if (
            !attached[item.snapshot.hash] ||
            attached[item.snapshot.hash] !== options.preferredFile
          )
            attached[item.snapshot.hash] = item.file;
        }
        options.onSnapshots(
          batch.map((x) => x.snapshot),
          attached,
        );
        try {
          await cacheSnapshots(batch.filter((x) => x.persist).map((x) => x.snapshot));
        } catch {
          warnCache();
        }
        for (const item of batch) item.resolve();
      } catch (error) {
        sinkFailure = error;
        for (const item of batch) item.reject(error);
      } finally {
        unsettled -= batch.length;
      }
    });
  }
  async function accept(incoming: Snapshot, file: File) {
    if (signal.aborted) throw abortError();
    let snapshot = incoming,
      persist = true;
    const previous = occupied.get(identity(snapshot));
    if (previous?.hash === snapshot.hash) {
      snapshot = { ...previous, fileName: file.name };
      persist = false;
    } else if (previous) {
      if (snapshot.hash.startsWith("blake3:") && /^[0-9a-f]{64}$/.test(previous.hash)) {
        const alias = await cachedHashAlias(snapshot.hash).catch(() => undefined);
        if (alias !== previous.hash) {
          // One bounded native SHA job at a time during the one-time alias migration.
          const sha = await legacy((parser) => parser.sha256File(file), true);
          if (sha !== previous.hash)
            throw Error(
              `A different save already occupies ${snapshot.date}. Separate alternate campaign branches before importing.`,
            );
          try {
            await cacheHashAlias(snapshot.hash, previous.hash);
          } catch {
            warnCache();
          }
        }
        snapshot = { ...previous, fileName: file.name };
        persist = false;
      } else
        throw Error(
          `A different save already occupies ${snapshot.date}. Separate alternate campaign branches before importing.`,
        );
    }
    if (signal.aborted) throw abortError();
    occupied.set(identity(snapshot), snapshot);
    if (sinkFailure) throw sinkFailure;
    const flushed = new Promise<void>((resolve, reject) => {
      unsettled++;
      pending.push({ snapshot, file, persist, resolve, reject });
      timer ??= setTimeout(flush, 64);
    });
    // Bound unwritten output to 16 + active-parser-count records. Unlike waiting
    // on every record, this overlaps parsing with IDB serialization and disk writes.
    void flushed.catch(() => {});
    if (unsettled >= 16) await Promise.race([flushed, aborted]);
  }
  const errors: { fileName: string; error: string }[] = [];
  const progress = (fileName: string) => options.onProgress(++completed, files.length, fileName);
  try {
    if (signal.aborted) throw abortError();
    const streaming: File[] = [],
      normal: File[] = [];
    // Read the header and, for text candidates, a bounded ZIP footer.
    for (const file of files) {
      if (signal.aborted) throw abortError();
      if (!file.name.toLowerCase().endsWith(".eu5")) {
        errors.push({ fileName: file.name, error: "Not an EU5 save" });
        progress(file.name);
        continue;
      }
      try {
        const header = await file.slice(0, 8).text();
        (globalThis.crossOriginIsolated &&
        typeof SharedArrayBuffer !== "undefined" &&
        header.startsWith("SAV") &&
        header.slice(5, 7) === "00" &&
        !(await hasZipDirectory(file))
          ? streaming
          : normal
        ).push(file);
      } catch (error) {
        if (signal.aborted) throw abortError();
        errors.push({ fileName: file.name, error: String(error) });
        progress(file.name);
      }
    }
    // Compressed/binary saves use one full parser after the streaming pool finishes.
    if (streaming.length) {
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      const defaultLimit = memory != null && memory <= 4 ? 2 : 8;
      const concurrency =
        options.concurrency ??
        Math.min(defaultLimit, Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
      const result = await streamSnapshots(streaming, {
        concurrency,
        parserBudgetMiB: concurrency * 192,
        algorithm: "blake3",
        signal,
        retainSnapshots: false,
        onSnapshot: accept,
        onProgress: ({ fileName }) => progress(fileName),
      });
      errors.push(...result.errors);
    }
    for (const file of normal) {
      if (signal.aborted) throw abortError();
      try {
        const result = await legacy((parser) => parser.parseSnapshot(file));
        await accept(result.snapshot, file);
      } catch (error) {
        if (signal.aborted) throw abortError();
        errors.push({ fileName: file.name, error: String(error) });
      }
      progress(file.name);
    }
    flush();
    await writes;
    if (sinkFailure) throw sinkFailure;
    return { errors, completed };
  } finally {
    if (timer) clearTimeout(timer);
    for (const item of pending) item.reject(abortError());
    pending = [];
    legacyWorker?.terminate();
    signal.removeEventListener("abort", abort);
  }
}
