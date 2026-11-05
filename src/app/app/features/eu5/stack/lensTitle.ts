import { useSyncExternalStore } from "react";

let title: string | null = null;
const listeners = new Set<() => void>();

/** While a lens lights one thing on the map, the map's title says that thing. */
export function setLensTitle(next: string | null) {
  if (title === next) return;
  title = next;
  listeners.forEach((listen) => listen());
}

export function useLensTitle() {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      return () => listeners.delete(listen);
    },
    () => title,
  );
}
