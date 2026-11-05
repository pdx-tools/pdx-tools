import { useSyncExternalStore } from "react";

let building = false;
const listeners = new Set<() => void>();

/**
 * The reader is adding countries from a list, so the list stays. A selection of a few
 * countries usually opens Compare, and here the reader says when with a button.
 */
export function setBuildingList(on: boolean) {
  if (building === on) return;
  building = on;
  listeners.forEach((listen) => listen());
}

export const isBuildingList = () => building;

export function useBuildingList() {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      return () => listeners.delete(listen);
    },
    () => building,
  );
}
