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

  const getWasmClient = async () => {
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

    return client.current;
  };

  const ret = useMemo(
    () => ({
      compress: async (data: Uint8Array, cb: ProgressCb) => {
        const wasm = await getWasmClient();
        return wasm.compress(transfer(data, [data.buffer]), proxy(cb));
      },

      transform: async (data: Uint8Array) => {
        const wasm = await getWasmClient();
        return wasm.transform(transfer(data, [data.buffer]));
      },
    }),
    []
  );

  return ret;
};
