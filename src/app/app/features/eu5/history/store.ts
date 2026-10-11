import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { create } from "zustand";
import type { FileVersion } from "@/features/campaign/localSaves";
import type { ImportProgressState } from "./ImportProgress";
import type { Snapshot } from "./types";

export type SourceObservation = { hash: string; version: FileVersion };
type HistoryState = {
  viewedProfiles: ActiveProfileIdentity[];
  setViewedProfiles: (profiles: ActiveProfileIdentity[]) => void;
  remapRevision: number;
  remapViewedProfiles: (profiles: ActiveProfileIdentity[]) => void;
  panelOpen: boolean;
  showPanel: (open: boolean) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  failedSaves: Record<string, string>;
  markFailed: (key: string, message: string) => void;
  snapshots: Snapshot[];
  sources: Record<string, SourceObservation>;
  analysisPaused: boolean;
  progress: ImportProgressState | null;
  issues: string[];
  cancel: (() => void) | null;
  add: (snapshots: Snapshot[], sources?: Record<string, SourceObservation>) => void;
  clear: () => void;
};

/** Historical data only. Campaign navigation owns files and the active save. */
export const useHistory = create<HistoryState>()((set) => ({
  viewedProfiles: [],
  setViewedProfiles: (viewedProfiles) => set({ viewedProfiles }),
  remapRevision: 0,
  remapViewedProfiles: (viewedProfiles) =>
    set((state) => ({ viewedProfiles, remapRevision: state.remapRevision + 1 })),
  panelOpen: false,
  showPanel: (panelOpen) => set({ panelOpen }),
  playing: false,
  setPlaying: (playing) => set({ playing }),
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  failedSaves: {},
  markFailed: (key, message) =>
    set((state) => ({ failedSaves: { ...state.failedSaves, [key]: message } })),
  snapshots: [],
  sources: {},
  analysisPaused: false,
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
