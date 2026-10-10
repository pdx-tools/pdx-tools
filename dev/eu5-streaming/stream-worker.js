import { createBridge } from "./bridge.js";

const modules = new Map();
async function parser(algorithm) {
  if (!modules.has(algorithm)) {
    modules.set(
      algorithm,
      (async () => {
        const module =
          algorithm === "sha256"
            ? await import("./pkg-sha/eu5_streaming.js")
            : await import("./pkg-blake3/eu5_streaming.js");
        const exports = await module.default();
        return { module, exports };
      })(),
    );
  }
  return modules.get(algorithm);
}

self.onmessage = async ({ data: { id, file, algorithm, chunkSize } }) => {
  let bridge;
  try {
    if (!["sha256", "blake3"].includes(algorithm)) throw Error("Unknown content hash algorithm");
    const started = performance.now();
    const { module, exports } = await parser(algorithm);
    bridge = await createBridge(file, chunkSize);
    // Hash raw bytes in the same pass that feeds the parser. Both flags stay true:
    // content verification and selective timeline deserialization.
    const result = module.stream_snapshot(bridge.read, chunkSize, true, true);
    if (result.bytesRead !== file.size || !result.hash) throw Error("Incomplete streamed save");
    const marketLabels = {};
    for (const market of result.snapshot.markets) {
      if (market.centerName) marketLabels[market.center] = market.centerName.replaceAll("_", " ");
    }
    self.postMessage({
      id,
      snapshot: {
        ...result.snapshot,
        hash: algorithm === "blake3" ? `blake3:${result.hash}` : result.hash,
        fileName: file.name,
        marketLabels,
      },
      metrics: {
        milliseconds: performance.now() - started,
        wasmBytes: exports.memory.buffer.byteLength,
        inputBufferBytes: 2 * chunkSize,
        bytesRead: result.bytesRead,
      },
    });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  } finally {
    bridge?.close();
  }
};
