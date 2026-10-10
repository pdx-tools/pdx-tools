import * as blakeModule from "./pkg-blake3/eu5_streaming.js";
import { createBridge } from "./bridge.js";

let ready;
const parser = () => (ready ??= blakeModule.default());

self.onmessage = async ({ data: { id, file, chunkSize } }) => {
  let bridge;
  try {
    await parser();
    bridge = await createBridge(file, chunkSize);
    const result = blakeModule.stream_snapshot(bridge.read, chunkSize);
    if (result.bytesRead !== file.size || !result.hash) throw Error("Incomplete streamed save");
    const marketLabels = {};
    for (const market of result.snapshot.markets) {
      if (market.centerName) marketLabels[market.center] = market.centerName.replaceAll("_", " ");
    }
    self.postMessage({
      id,
      snapshot: {
        ...result.snapshot,
        hash: `blake3:${result.hash}`,
        fileName: file.name,
        marketLabels,
      },
    });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  } finally {
    bridge?.close();
  }
};
