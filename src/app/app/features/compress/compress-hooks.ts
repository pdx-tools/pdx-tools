import { wrap, transfer, releaseProxy, proxy } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";
import type { ProgressCb } from "./compress-worker";
import type * as CompressWorkerModule from "./compress-worker";

type CompressionWorker = typeof CompressWorkerModule.obj;
export function createCompressionWorker() {
  const worker = new Worker(new URL("./compress-worker", import.meta.url), {
    type: "module",
  });
  trackWorker(worker);
  const workerApi = wrap<CompressionWorker>(worker);
  return {
    worker,
    workerApi,
    release: () => {
      workerApi[releaseProxy]();
      worker.terminate();
    },
    compress: async (data: Uint8Array<ArrayBuffer>, cb: ProgressCb) => {
      await workerApi.loadWasm();
      return workerApi.compress(transfer(data, [data.buffer]), proxy(cb));
    },

    download: async (data: Uint8Array<ArrayBuffer>, cb?: ProgressCb) => {
      await workerApi.loadWasm();
      return workerApi.download(transfer(data, [data.buffer]), cb && proxy(cb));
    },
  };
}
