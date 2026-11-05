import { useCallback, useEffect, useMemo, useRef } from "react";
import { useEu5Engine, useEu5TimelineBarHeight } from "../store";
import { useViewportInsets } from "../useViewportInsets";

/** The height that the map bar takes at the top of the map */
const MAP_BAR_CLEARANCE = 48;

/**
 * Shows the whole selection in the part of the map that nothing covers: not the
 * column, the map bar or the timeline.
 */
export function useFrameSelection() {
  const engine = useEu5Engine();
  const latest = useViewportInsets();
  const timeline = useEu5TimelineBarHeight();
  const free = useMemo(
    () => ({
      ...latest,
      top: MAP_BAR_CLEARANCE,
      bottom: latest.bottom + (timeline > 0 ? timeline + 16 : 0),
    }),
    [latest, timeline],
  );
  const insets = useRef(free);
  useEffect(() => {
    insets.current = free;
  }, [free]);
  return useCallback(() => {
    // The map key stands over the lower part of the free map, so the frame stops above it.
    const key = document.querySelector('[aria-label="Map key"]')?.getBoundingClientRect();
    const bottom = key
      ? Math.max(insets.current.bottom, window.innerHeight - key.top)
      : insets.current.bottom;
    void engine.trigger.frameSelection({ ...insets.current, bottom }).catch(() => {});
  }, [engine]);
}
