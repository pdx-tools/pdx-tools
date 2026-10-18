import { create } from "zustand";
import type { FileVersion } from "@/features/campaign/types";
import type { ImportProgressState } from "./importTiming";
import type { SnapshotMetadata } from "./types";

export type SourceObservation = { hash: string; version: FileVersion };
type HistoryState = {
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  /** The history section of the insight panel is open. It stays open when a save opens. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  snapshots: SnapshotMetadata[];
  sources: Record<string, SourceObservation>;
  analyzingEntryIds: readonly string[];
  analysisEnabledCampaigns: readonly string[];
  enableAnalysis: (campaignId: string) => void;
  analysisPaused: boolean;
  analysisPausedCampaigns: string[];
  progress: ImportProgressState | null;
  issues: string[];
  /** Why the store refused saves, or null when it has space. */
  memoryFull: string | null;
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
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
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
  memoryFull: null,
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
