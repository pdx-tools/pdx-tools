import { create } from "zustand";
import { campaignAnalysisState } from "@/features/campaign/analysis/analysisState";
import type { CampaignAnalysisState } from "@/features/campaign/analysis/analysisState";
import type { Eu5SnapshotDescriptor } from "./analysisTypes";

type HistoryState = CampaignAnalysisState<Eu5SnapshotDescriptor> & {
  panelOpen: boolean;
  showPanel: (open: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
};

/** Historical data only. Campaign navigation owns files and the active save. */
export const useHistory = create<HistoryState>()((set) => ({
  panelOpen: false,
  showPanel: (panelOpen) => set({ panelOpen }),
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  ...campaignAnalysisState<Eu5SnapshotDescriptor>(set),
}));
