import { wrap, Remote, transfer, releaseProxy, proxy } from "comlink";
import { useEffect, useMemo, useRef } from "react";
import type { ProgressCb, CompressionWorker } from "./compress-worker";

export const useCompression = () => {
  const worker = useRef<Worker>();
  const client = useRef<Remote<CompressionWorker>>();

  useEffect(() => {
    return () => {
      client.current?.[releaseProxy]();
      worker.current?.terminate();
    };
  }, []);

  const ret = useMemo(
    () => ({
      compress: async (data: Uint8Array, cb: ProgressCb) => {
        if (!worker.current) {
          worker.current = new Worker(
            new URL("./compress-worker", import.meta.url)
          );
        }

        if (!client.current) {
          const workerApi = wrap<CompressionWorker>(worker.current);
          await workerApi.loadWasm();
          client.current = workerApi;
        }

        return client.current.compress(
          transfer(data, [data.buffer]),
          proxy(cb)
        );
      },
    }),
    []
  );

  return ret;
};
