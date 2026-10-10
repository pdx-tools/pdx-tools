/** Experimental text-save timeline importer. No complete raw-file buffers are queued. */
export async function importSnapshots(
  files,
  {
    concurrency = 4,
    parserBudgetMiB = 768,
    estimatedWorkerMiB = 192,
    chunkSize = 8 * 1024 * 1024,
    algorithm = "sha256",
    onSnapshot = async () => {},
    onProgress = () => {},
    signal,
  } = {},
) {
  if (!Array.isArray(files)) files = Array.from(files);
  if (!["sha256", "blake3"].includes(algorithm)) throw Error("Unknown content hash algorithm");
  if (!Number.isInteger(chunkSize) || chunkSize < 64 * 1024 || chunkSize > 16 * 1024 * 1024)
    throw Error("Chunk size must be 64 KiB to 16 MiB");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw Error("Concurrency must be 1 to 8");
  if (
    !Number.isFinite(parserBudgetMiB) ||
    !Number.isFinite(estimatedWorkerMiB) ||
    estimatedWorkerMiB <= 0 ||
    parserBudgetMiB < estimatedWorkerMiB
  )
    throw Error("Parser budget must fit at least one worker");
  if (!globalThis.crossOriginIsolated) throw Error("Streaming needs COOP/COEP headers");
  const count = Math.min(
    concurrency,
    files.length,
    Math.floor(parserBudgetMiB / estimatedWorkerMiB),
  );
  let next = 0,
    completed = 0,
    sequence = 0;
  const snapshots = [],
    errors = [],
    metrics = [],
    slots = new Set();
  const abortError = () => new DOMException("Import stopped", "AbortError");
  function makeSlot() {
    const slot = {
      worker: new Worker(new URL("./stream-worker.js", import.meta.url), { type: "module" }),
      reject: null,
    };
    slots.add(slot);
    return slot;
  }
  function stop(slot) {
    slot.worker.terminate();
    slot.reject?.(abortError());
    slot.reject = null;
    slots.delete(slot);
  }
  const abort = () => {
    for (const slot of [...slots]) stop(slot);
  };
  signal?.addEventListener("abort", abort, { once: true });
  function parse(slot, file) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const id = sequence++;
      slot.reject = reject;
      slot.worker.onmessage = ({ data }) => {
        if (data.id !== id) return;
        slot.reject = null;
        data.error ? reject(Error(data.error)) : resolve(data);
      };
      slot.worker.onerror = (event) => {
        slot.reject = null;
        reject(Error(event.message || "Parser worker failed"));
      };
      slot.worker.postMessage({ id, file, algorithm, chunkSize });
    });
  }
  try {
    await Promise.all(
      Array.from({ length: count }, async () => {
        let slot = makeSlot();
        try {
          while (next < files.length && !signal?.aborted) {
            const file = files[next++];
            try {
              const result = await parse(slot, file);
              if (signal?.aborted) break;
              // Await the sink before another save starts on this worker.
              await onSnapshot(result.snapshot, file, result.metrics);
              if (signal?.aborted) break;
              snapshots.push(result.snapshot);
              metrics.push(result.metrics);
            } catch (error) {
              if (signal?.aborted) break;
              errors.push({ fileName: file.name, error: String(error) });
              stop(slot);
              slot = makeSlot();
            }
            onProgress({ completed: ++completed, total: files.length, fileName: file.name });
          }
        } finally {
          stop(slot);
        }
      }),
    );
    if (signal?.aborted) throw abortError();
    snapshots.sort((a, b) => a.dateSort - b.dateSort || a.hash.localeCompare(b.hash));
    return { snapshots, errors, metrics, workers: count };
  } finally {
    signal?.removeEventListener("abort", abort);
    abort();
  }
}
