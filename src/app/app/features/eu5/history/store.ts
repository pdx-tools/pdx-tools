import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { create } from "zustand";
import type { FileVersion } from "@/features/campaign/types";
import type { ImportProgressState } from "./importTiming";
import type { SnapshotMetadata } from "./types";

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
  snapshots: SnapshotMetadata[];
  sources: Record<string, SourceObservation>;
  analyzingEntryIds: readonly string[];
  analysisEnabledCampaigns: readonly string[];
  enableAnalysis: (campaignId: string) => void;
  analysisPaused: boolean;
  analysisPausedCampaigns: string[];
  progress: ImportProgressState | null;
  issues: string[];
  cancel: (() => void) | null;
  add: (snapshots: SnapshotMetadata[], sources?: Record<string, SourceObservation>) => void;
};

export function isAnalysisPaused(
  state: Pick<HistoryState, "analysisPaused" | "analysisPausedCampaigns">,
  playthroughId: string | null | undefined,
) {
  return (
    state.analysisPaused ||
    (!!playthroughId && state.analysisPausedCampaigns.includes(playthroughId))
  );
}

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
  snapshots: [],
  sources: {},
  analyzingEntryIds: [],
  analysisEnabledCampaigns: [],
  enableAnalysis: (campaignId) =>
    set((state) => ({
      analysisEnabledCampaigns: [...new Set([...state.analysisEnabledCampaigns, campaignId])],
      analysisPaused: false,
      analysisPausedCampaigns: state.analysisPausedCampaigns.filter((id) => id !== campaignId),
    })),
  analysisPaused: false,
  analysisPausedCampaigns: [],
  progress: null,
  issues: [],
  cancel: null,
  add: (snapshots, sources = {}) =>
    set((state) => {
      const byHash = new Map(state.snapshots.map((snapshot) => [snapshot.hash, snapshot]));
      for (const snapshot of snapshots) byHash.set(snapshot.hash, snapshot);
      return {
        snapshots: [...byHash.values()].sort(
          (a, b) => a.dateSort - b.dateSort || a.hash.localeCompare(b.hash),
        ),
        sources: { ...state.sources, ...sources },
      };
    }),
}));
