import { wrap, transfer, releaseProxy, proxy } from "comlink";
import { useEffect, useMemo, useRef } from "react";
import type { ProgressCb } from "./compress-worker";
import type * as CompressWorkerModule from "./compress-worker";

type CompressionWorker = typeof CompressWorkerModule.obj;
export function createCompressionWorker() {
  const worker = new Worker(new URL("./compress-worker", import.meta.url), {
    type: "module",
  });
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

    transform: async (data: Uint8Array<ArrayBuffer>) => {
      await workerApi.loadWasm();
      return workerApi.transform(transfer(data, [data.buffer]));
    },
  };
}

export const useCompression = () => {
  const worker = useRef<ReturnType<typeof createCompressionWorker>>(undefined);

  useEffect(() => {
    const current = worker.current;
    return () => current?.release();
  }, []);

  return useMemo(
    () => ({
      transform: async (data: Uint8Array<ArrayBuffer>) =>
        (worker.current ??= createCompressionWorker()).transform(data),
    }),
    [],
  );
};
