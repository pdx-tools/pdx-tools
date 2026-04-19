import { useCallback } from "react";
import { useEu5Engine } from "./store";
import { useViewportInsets } from "./useViewportInsets";

export function usePanToEntity() {
  const engine = useEu5Engine();
  const insets = useViewportInsets();

  return useCallback(
    (locationIdx: number) => {
      void engine.trigger.panToLocation(locationIdx, insets);
    },
    [engine, insets],
  );
}
