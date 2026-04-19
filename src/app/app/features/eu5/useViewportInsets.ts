import { useMemo } from "react";
import { useEu5InsightPanelOpen, useEu5InsightPanelWidth } from "./store";

// Panel geometry changes do NOT trigger auto-pan — see PRD §Viewport Behavior.
// The visible-region check exists only for explicit selection actions.
const CONTROL_SIDEBAR_WIDTH = 332;

export interface ViewportInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function useViewportInsets(): ViewportInsets {
  const insightPanelOpen = useEu5InsightPanelOpen();
  const insightPanelWidth = useEu5InsightPanelWidth();

  return useMemo(
    () => ({
      left: CONTROL_SIDEBAR_WIDTH,
      right: insightPanelOpen ? insightPanelWidth : 0,
      top: 0,
      bottom: 0,
    }),
    [insightPanelOpen, insightPanelWidth],
  );
}
