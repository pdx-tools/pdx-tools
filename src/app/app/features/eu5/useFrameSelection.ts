import { useCallback } from "react";
import { useEu5Context } from "./store";
import { viewportInsets } from "./useViewportInsets";

/**
 * Show all of the selected land in the part of the map that the panels do not
 * cover. The panels are read when the frame starts, so a panel that opens
 * after the selection changes is also cleared.
 */
export function useFrameSelection() {
  const store = useEu5Context();
  return useCallback(async () => {
    const state = store.getState();
    try {
      await state.engine.trigger.frameSelection(viewportInsets(state));
    } catch (error) {
      console.warn("Failed to frame the selection", error);
    }
  }, [store]);
}
