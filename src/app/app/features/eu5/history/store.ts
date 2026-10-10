import { create } from "zustand";
import type { MapMode, ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import type { Snapshot } from "./types";

type HistoryState = {
  viewedProfile: ActiveProfileIdentity | null;
  setViewedProfile: (profile: ActiveProfileIdentity | null) => void;
  snapshots: Snapshot[];
  files: Record<string, File>;
  selectedHash: string | null;
  mapMode: MapMode;
  panelOpen: boolean;
  insightOpen: boolean;
  rememberPanel: (open: boolean) => void;
  playing: boolean;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  switching: boolean;
  switchError: string | null;
  failedSnapshots: Record<string, string>;
  markSnapshotFailed: (hash: string, error: string) => void;
  clearSnapshotFailure: (hash: string) => void;
  lastSwitch: { milliseconds: number; cacheHit: boolean } | null;
  setSwitching: (busy: boolean) => void;
  setSwitchError: (error: string) => void;
  setTiming: (milliseconds: number, cacheHit: boolean) => void;
  setPlaying: (playing: boolean) => void;
  timelineSource: "snapshots" | "ownership";
  showPanel: (open: boolean) => void;
  setTimelineSource: (source: "snapshots" | "ownership") => void;
  add: (snapshots: Snapshot[], files?: Record<string, File>) => void;
  select: (hash: string) => void;
  rememberMode: (mode: MapMode) => void;
  clear: () => void;
};

export const useHistory = create<HistoryState>()((set) => ({
  viewedProfile: null,
  setViewedProfile: (viewedProfile) => set({ viewedProfile }),
  snapshots: [],
  files: {},
  selectedHash: null,
  mapMode: "political",
  panelOpen: false,
  insightOpen: false,
  rememberPanel: (insightOpen) => set({ insightOpen }),
  playing: false,
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  switching: false,
  switchError: null,
  failedSnapshots: {},
  markSnapshotFailed: (hash, error) =>
    set((state) => ({
      failedSnapshots: { ...state.failedSnapshots, [hash]: error },
      switchError: error,
    })),
  clearSnapshotFailure: (hash) =>
    set((state) => {
      const failedSnapshots = { ...state.failedSnapshots };
      delete failedSnapshots[hash];
      return { failedSnapshots };
    }),
  lastSwitch: null,
  setSwitching: (switching) => set({ switching, ...(switching ? { switchError: null } : {}) }),
  setSwitchError: (switchError) => set({ switchError }),
  setTiming: (milliseconds, cacheHit) => set({ lastSwitch: { milliseconds, cacheHit } }),
  setPlaying: (playing) => set({ playing }),
  timelineSource: "snapshots",
  showPanel: (panelOpen) => set({ panelOpen }),
  setTimelineSource: (timelineSource) => set({ timelineSource }),
  add: (snapshots, files = {}) =>
    set((state) => {
      const byHash = new Map(state.snapshots.map((s) => [s.hash, s]));
      let changed = false;
      for (const s of snapshots) {
        if (s.schemaVersion !== 3) continue;
        const previous = byHash.get(s.hash);
        // Matching content hashes and schemas are the same immutable observation.
        // Reattaching source files must not rebuild every historical series.
        if (!previous || previous.fileName !== s.fileName) {
          byHash.set(s.hash, s);
          changed = true;
        }
      }
      return {
        snapshots: changed
          ? [...byHash.values()].sort(
              (a, b) => a.dateSort - b.dateSort || a.hash.localeCompare(b.hash),
            )
          : state.snapshots,
        files: { ...state.files, ...files },
      };
    }),
  select: (selectedHash) => set({ selectedHash }),
  rememberMode: (mapMode) => set({ mapMode }),
  clear: () =>
    set({
      snapshots: [],
      files: {},
      selectedHash: null,
      mapMode: "political",
      playing: false,
      failedSnapshots: {},
      switchError: null,
    }),
}));
