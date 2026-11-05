import { useSyncExternalStore } from "react";

export type NameCount = { shown: number; wanted: number };

let count: NameCount = { shown: 0, wanted: 0 };
const listeners = new Set<() => void>();

/** How many of the names that must show have a place on the map now */
export function setNameCount(next: NameCount) {
  if (count.shown === next.shown && count.wanted === next.wanted) return;
  count = next;
  listeners.forEach((listen) => listen());
}

export function useNameCount() {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      return () => listeners.delete(listen);
    },
    () => count,
  );
}
