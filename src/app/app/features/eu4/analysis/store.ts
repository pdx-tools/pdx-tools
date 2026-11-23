import { create } from "zustand";
import { campaignAnalysisState } from "@/features/campaign/analysis/analysisState";
import type { CampaignAnalysisState } from "@/features/campaign/analysis/analysisState";
import type { Eu4SnapshotDescriptor } from "./analysisTypes";

type Eu4HistoryState = CampaignAnalysisState<Eu4SnapshotDescriptor>;

/** The EU4 campaign analysis of this tab. Campaign navigation owns files and the active save. */
export const useEu4History = create<Eu4HistoryState>()((set) => ({
  ...campaignAnalysisState<Eu4SnapshotDescriptor>(set),
}));
