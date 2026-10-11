import { create } from "zustand";
import type { FileVersion } from "@/features/campaign/localSaves";
import type { ImportProgressState } from "./ImportProgress";
import type { Snapshot } from "./types";

export type SourceObservation = { hash: string; version: FileVersion };
type HistoryState = {
  snapshots: Snapshot[];
  sources: Record<string, SourceObservation>;
  progress: ImportProgressState | null;
  issues: string[];
  cancel: (() => void) | null;
  add: (snapshots: Snapshot[], sources?: Record<string, SourceObservation>) => void;
  clear: () => void;
};

/** Historical data only. Campaign navigation owns files and the active save. */
export const useHistory = create<HistoryState>()((set) => ({
  snapshots: [],
  sources: {},
  progress: null,
  issues: [],
  cancel: null,
  add: (snapshots, sources = {}) =>
    set((state) => {
      const byHash = new Map(state.snapshots.map((snapshot) => [snapshot.hash, snapshot]));
      for (const snapshot of snapshots)
        if (snapshot.schemaVersion === 3) byHash.set(snapshot.hash, snapshot);
      return {
        snapshots: [...byHash.values()].sort(
          (a, b) => a.dateSort - b.dateSort || a.hash.localeCompare(b.hash),
        ),
        sources: { ...state.sources, ...sources },
      };
    }),
  clear: () => set({ snapshots: [], sources: {}, issues: [] }),
}));
