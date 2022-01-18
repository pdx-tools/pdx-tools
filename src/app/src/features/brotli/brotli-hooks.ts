import { wrap, Remote, transfer, releaseProxy, proxy } from "comlink";
import { useEffect, useMemo, useRef } from "react";
import type { BrotliProgressCb, BrotliWorker } from "./brotli-worker";

export const useBrotli = () => {
  const worker = useRef<Worker>();
  const client = useRef<Remote<BrotliWorker>>();

  useEffect(() => {
    return () => {
      client.current?.[releaseProxy]();
      worker.current?.terminate();
    };
  }, []);

  const ret = useMemo(
    () => ({
      compress: async (data: Uint8Array, cb: BrotliProgressCb) => {
        if (!worker.current) {
          worker.current = new Worker(
            new URL("./brotli-worker", import.meta.url)
          );
        }

        if (!client.current) {
          const workerApi = wrap<BrotliWorker>(worker.current);
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
