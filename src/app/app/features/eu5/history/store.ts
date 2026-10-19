import { create } from "zustand";
import { compareDescriptors } from "@/features/campaign/analysis/descriptor";
import type { SourceAssociation } from "@/features/campaign/analysis/descriptor";
import type { ImportProgressState } from "./importTiming";
import type { Eu5SnapshotDescriptor } from "./analysisTypes";

type HistoryState = {
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  snapshots: Eu5SnapshotDescriptor[];
  sources: Record<string, SourceAssociation>;
  analyzingEntryIds: readonly string[];
  analysisEnabledCampaigns: readonly string[];
  enableAnalysis: (campaignId: string) => void;
  analysisPaused: boolean;
  analysisPausedCampaigns: string[];
  progress: ImportProgressState | null;
  issues: string[];
  cancel: (() => void) | null;
  add: (snapshots: Eu5SnapshotDescriptor[], sources?: Record<string, SourceAssociation>) => void;
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
      const byId = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
      for (const snapshot of snapshots) byId.set(snapshot.id, snapshot);
      return {
        snapshots: [...byId.values()].sort(compareDescriptors),
        sources: { ...state.sources, ...sources },
      };
    }),
}));
