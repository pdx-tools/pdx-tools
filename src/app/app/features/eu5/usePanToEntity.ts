import { useCallback } from "react";
import { activeEu5Store, useEu5Engine } from "./store";
import { useViewportInsets } from "./useViewportInsets";

export function usePanToEntity() {
  const engine = useEu5Engine();
  const insets = useViewportInsets();

  return useCallback(
    (locationIdx: number) => {
      void (activeEu5Store()?.getState().engine ?? engine).trigger.panToLocation(
        locationIdx,
        insets,
      );
    },
    [engine, insets],
  );
}
