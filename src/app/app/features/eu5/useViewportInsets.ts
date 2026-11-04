import { useMemo } from "react";
import { useEu5ColumnInset } from "./store";

// Panel geometry changes do NOT trigger auto-pan — see PRD §Viewport Behavior.
// The visible-region check exists only for explicit selection actions.

export interface ViewportInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The part of the map that the column covers, as the column measures it */
export function useViewportInsets(): ViewportInsets {
  const column = useEu5ColumnInset();

  return useMemo(() => ({ left: column.left, right: 0, top: 0, bottom: column.bottom }), [column]);
}
