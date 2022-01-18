import { useEffect } from "react";
import { useVisualizationDispatch } from "./visualization-context";

export const VisualizationLoader: React.FC<{}> = () => {
  const dispatch = useVisualizationDispatch();
  useEffect(() => {
    dispatch({ type: "enqueue-loading" });
    return () => {
      dispatch({ type: "dequeue-loading" });
    };
  }, [dispatch]);
  return null;
};
