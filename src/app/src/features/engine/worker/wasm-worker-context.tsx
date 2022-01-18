import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { releaseProxy, Remote, wrap } from "comlink";
import { WasmWorker } from "./worker";
import { captureException } from "@sentry/nextjs";
import { useDispatch, useSelector } from "react-redux";
import { newError } from "@/features/notifications";
import { selectAnalyzeId } from "../engineSlice";
import { useVisualizationDispatch } from "@/components/viz/visualization-context";
import { useIsMounted } from "@/hooks/useIsMounted";

export type WorkerClient = Remote<WasmWorker>;

interface WasmWorkerClient {
  rawWorker: Worker;
  worker: WorkerClient;
}

type WasmContextState = MutableRefObject<WasmWorkerClient | undefined>;

const WasmWorkerContext = React.createContext<WasmContextState | undefined>(
  undefined
);

export const WasmWorkerProvider: React.FC<{}> = ({ children }) => {
  const workerRef = useRef<WasmWorkerClient>();
  const [render, setRender] = useState(false);

  useEffect(() => {
    const rawWorker = new Worker(new URL("./worker", import.meta.url));
    const worker = wrap<WasmWorker>(rawWorker);
    workerRef.current = {
      rawWorker,
      worker,
    };
    setRender(true);

    return () => {
      if (workerRef.current) {
        workerRef.current.worker[releaseProxy]();
        workerRef.current.rawWorker.terminate();
        workerRef.current = undefined;
      }
    };
  }, []);

  return (
    <WasmWorkerContext.Provider value={workerRef}>
      {render && children}
    </WasmWorkerContext.Provider>
  );
};

export function getWasmWorker(x: WasmContextState) {
  if (!x.current) {
    throw new Error("no wasm worker detected");
  } else {
    return x.current.worker;
  }
}

export function useWasmWorker() {
  const context = React.useContext(WasmWorkerContext);
  if (context === undefined) {
    throw new Error("unable to create wasm worker context");
  }

  return context;
}

export const useWorkerOnSave = (cb: (arg0: WorkerClient) => Promise<void>) => {
  const workerRef = useWasmWorker();
  const analyzeId = useSelector(selectAnalyzeId);
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const isMounted = useIsMounted();

  useEffect(() => {
    async function getData() {
      try {
        if (isMounted.current) {
          setLoading(true);
          const worker = getWasmWorker(workerRef);
          await cb(worker);
        }
      } catch (error) {
        captureException(error);
        dispatch(newError(error));
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    }
    getData();
  }, [workerRef, cb, analyzeId, dispatch, isMounted]);

  return loading;
};

export const useComputeOnSave = <T,>(
  cb: (arg0: WorkerClient) => Promise<T>
) => {
  const [data, setData] = useState<T | undefined>(undefined);
  const c = useCallback(
    async (worker) => {
      const result = await cb(worker);
      setData(result);
    },
    [cb]
  );

  const loading = useWorkerOnSave(c);
  return { loading, data };
};

export const useAnalysisWorker = (
  cb: (arg0: WorkerClient) => Promise<void>
) => {
  const loading = useWorkerOnSave(cb);
  const visualizationDispatch = useVisualizationDispatch();
  const hasMounted = useRef(false);
  useEffect(() => {
    if (hasMounted.current) {
      if (loading) {
        visualizationDispatch({ type: "enqueue-loading" });
      } else {
        visualizationDispatch({ type: "dequeue-loading" });
      }
    } else {
      hasMounted.current = true;
    }
  }, [loading, visualizationDispatch]);
};
