import { producerSource } from "./producer-source.js";
export async function createBridge(file, chunkSize) {
  if (!self.crossOriginIsolated || typeof SharedArrayBuffer === "undefined")
    throw Error("Streaming bridge needs COOP/COEP cross-origin isolation");
  const sab = new SharedArrayBuffer(64 + 2 * chunkSize),
    control = new Int32Array(sab, 0, 16);
  const producerUrl = URL.createObjectURL(new Blob([producerSource], { type: "text/javascript" }));
  const worker = new Worker(producerUrl);
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Streaming worker startup timed out")), 30000);
    worker.onmessage = () => {
      clearTimeout(timer);
      resolve();
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(Error("Producer startup failed: " + (e.message || e.type)));
    };
  });
  worker.postMessage({ file, sab, chunkSize });
  try {
    await ready;
  } catch (e) {
    worker.terminate();
    throw e;
  } finally {
    URL.revokeObjectURL(producerUrl);
  }
  let slot = 0,
    previous = -1,
    offset = 0,
    eof = false;
  return {
    read(requestedOffset) {
      if (requestedOffset !== offset) throw Error("Unexpected stream offset");
      if (eof) return new Uint8Array(0);
      if (previous >= 0) {
        Atomics.store(control, previous, 0);
        Atomics.notify(control, previous);
        previous = -1;
      }
      let status = Atomics.load(control, slot);
      while (status === 0) {
        if (Atomics.wait(control, slot, 0, 30000) === "timed-out")
          throw Error("Streaming reader timed out");
        status = Atomics.load(control, slot);
      }
      if (status === 3) throw Error("Streaming file reader failed");
      if (status === 2) {
        eof = true;
        return new Uint8Array(0);
      }
      const length = Atomics.load(control, 2 + slot);
      if (length < 1 || length > chunkSize) throw Error("Invalid streaming chunk length");
      const view = new Uint8Array(sab, 64 + slot * chunkSize, length);
      offset += length;
      previous = slot;
      slot = 1 - slot;
      return view;
    },
    close() {
      worker.terminate();
    },
  };
}
