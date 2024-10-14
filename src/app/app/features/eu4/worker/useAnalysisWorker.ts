import { useEffect } from "react";
import { useVisualizationDispatch } from "@/components/viz/visualization-context";
import { useEu4Worker } from "./useEu4Worker";
import { Eu4Worker } from "./types";

export const useAnalysisWorker = <T>(cb: (arg0: Eu4Worker) => Promise<T>) => {
  const { isLoading, data, error } = useEu4Worker(cb);
  const visualizationDispatch = useVisualizationDispatch();
  useEffect(() => {
    if (isLoading) {
      visualizationDispatch({ type: "enqueue-loading" });
    } else {
      visualizationDispatch({ type: "dequeue-loading" });
    }
  }, [isLoading, visualizationDispatch]);

  return { data, error };
};
