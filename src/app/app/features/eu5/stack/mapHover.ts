import { useSyncExternalStore } from "react";

export type HoverLabel = { key: string; text: string; locationIdx: number };

let hovered: HoverLabel | null = null;
const listeners = new Set<() => void>();

/** A row of the column names itself on the map while it has the pointer. */
export function setMapHoverLabel(label: HoverLabel | null) {
  if (hovered?.key === label?.key) return;
  hovered = label;
  listeners.forEach((listen) => listen());
}

export function useMapHoverLabel() {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      return () => listeners.delete(listen);
    },
    () => hovered,
  );
}
