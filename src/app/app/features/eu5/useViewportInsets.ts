import { useMemo } from "react";
import { useEu5InsightPanelOpen, useEu5InsightPanelWidth, useEu5TimelineBarHeight } from "./store";

// Panel geometry changes do NOT trigger auto-pan — see PRD §Viewport Behavior.
// The visible-region check exists only for explicit selection actions.
const CONTROL_SIDEBAR_WIDTH = 332;

export interface ViewportInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type PanelLayout = {
  insightPanelOpen: boolean;
  insightPanelWidth: number;
  timelineBarHeight: number;
};

/** The parts of the map that the panels cover. */
export function viewportInsets(layout: PanelLayout): ViewportInsets {
  return {
    left: CONTROL_SIDEBAR_WIDTH,
    right: layout.insightPanelOpen ? layout.insightPanelWidth : 0,
    top: 0,
    bottom: layout.timelineBarHeight,
  };
}

export function useViewportInsets(): ViewportInsets {
  const insightPanelOpen = useEu5InsightPanelOpen();
  const insightPanelWidth = useEu5InsightPanelWidth();
  const timelineBarHeight = useEu5TimelineBarHeight();

  return useMemo(
    () => viewportInsets({ insightPanelOpen, insightPanelWidth, timelineBarHeight }),
    [insightPanelOpen, insightPanelWidth, timelineBarHeight],
  );
}
