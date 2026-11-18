import type { FileVersion } from "@/features/campaign/types";
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
  failedSources: Record<string, { version: FileVersion | null; error: string }>;
  analysisEnabledCampaigns: readonly string[];
  enableAnalysis: (campaignId: string) => void;
  /** The campaigns that do not start imports until the player resumes them. */
  analysisPausedCampaigns: string[];
  pauseAnalysis: (campaignId: string) => void;
  progress: ImportProgressState | null;
  issues: string[];
  cancel: (() => void) | null;
  add: (snapshots: Eu5SnapshotDescriptor[], sources?: Record<string, SourceAssociation>) => void;
  /** Remove the snapshots and the source associations to them. */
  removeSnapshots: () => void;
};

export function isAnalysisPaused(
  state: Pick<HistoryState, "analysisPausedCampaigns">,
  playthroughId: string | null | undefined,
) {
  return !!playthroughId && state.analysisPausedCampaigns.includes(playthroughId);
}

/** Historical data only. Campaign navigation owns files and the active save. */
export const useHistory = create<HistoryState>()((set) => ({
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  snapshots: [],
  sources: {},
  analyzingEntryIds: [],
  failedSources: {},
  analysisEnabledCampaigns: [],
  enableAnalysis: (campaignId) =>
    set((state) => ({
      analysisEnabledCampaigns: [...new Set([...state.analysisEnabledCampaigns, campaignId])],
      analysisPausedCampaigns: state.analysisPausedCampaigns.filter((id) => id !== campaignId),
    })),
  analysisPausedCampaigns: [],
  pauseAnalysis: (campaignId) =>
    set((state) =>
      state.analysisPausedCampaigns.includes(campaignId)
        ? state
        : { analysisPausedCampaigns: [...state.analysisPausedCampaigns, campaignId] },
    ),
  progress: null,
  issues: [],
  cancel: null,
  add: (snapshots, sources = {}) =>
    set((state) => {
      const byId = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
      for (const snapshot of snapshots) byId.set(snapshot.id, snapshot);
      const failedSources = { ...state.failedSources };
      for (const id of Object.keys(sources)) delete failedSources[id];
      return {
        failedSources,
        snapshots: [...byId.values()].sort(compareDescriptors),
        sources: { ...state.sources, ...sources },
      };
    }),
  removeSnapshots: () => set({ snapshots: [], sources: {} }),
}));
