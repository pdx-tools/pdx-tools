import type { StoreApi } from "zustand";
import type { FileVersion } from "@/features/campaign/types";
import { compareDescriptors } from "./descriptor";
import type { SnapshotDescriptor, SourceAssociation } from "./descriptor";
import type { ImportProgressState } from "./importTiming";
import type { AnalysisWorkerOptions } from "./workerClient";

/** What analysis has of an upload. An upload does not change, so it needs no version. */
export type UploadAnalysis =
  | { kind: "ready"; snapshotId: string }
  /** A download can work on a retry. A save that could not be read fails again. */
  | { kind: "failed"; reason: "download" | "read"; error: string };

/** The analysis of the claimed campaign. Campaign navigation owns files and the active save. */
export type CampaignAnalysisState<D extends SnapshotDescriptor = SnapshotDescriptor> = {
  snapshots: D[];
  /** The snapshot of each local save entry, by entry ID. */
  sources: Record<string, SourceAssociation>;
  analyzingEntryIds: readonly string[];
  failedSources: Record<string, { version: FileVersion | null; error: string }>;
  /** What analysis has of each upload, by save ID. */
  uploads: Record<string, UploadAnalysis>;
  analyzingUploadIds: readonly string[];
  analysisEnabledCampaigns: readonly string[];
  enableAnalysis: (campaignId: string) => void;
  /** The campaigns that do not start imports until the player resumes them. */
  analysisPausedCampaigns: string[];
  pauseAnalysis: (campaignId: string) => void;
  progress: ImportProgressState | null;
  issues: string[];
  cancel: (() => void) | null;
  add: (
    snapshots: D[],
    sources?: Record<string, SourceAssociation>,
    /** The snapshot of each upload, by save ID. */
    uploads?: Record<string, string>,
  ) => void;
  /** Remove the snapshots and the source associations to them. */
  removeSnapshots: () => void;
};

/**
 * A zustand store that holds a campaign analysis, such as one that
 * `campaignAnalysisState` fills. The store can hold more than the analysis.
 */
export type AnalysisHistory<D extends SnapshotDescriptor = SnapshotDescriptor> = Pick<
  StoreApi<CampaignAnalysisState<D>>,
  "getState" | "getInitialState" | "subscribe"
> & {
  setState: (
    partial:
      | Partial<CampaignAnalysisState<D>>
      | ((state: CampaignAnalysisState<D>) => Partial<CampaignAnalysisState<D>>),
  ) => void;
};

export function isAnalysisPaused(
  state: Pick<CampaignAnalysisState, "analysisPausedCampaigns">,
  playthroughId: string | null | undefined,
) {
  return !!playthroughId && state.analysisPausedCampaigns.includes(playthroughId);
}

/** The initial analysis state and its actions, for a zustand store of a game. */
export function campaignAnalysisState<D extends SnapshotDescriptor>(
  set: StoreApi<CampaignAnalysisState<D>>["setState"],
): CampaignAnalysisState<D> {
  return {
    snapshots: [],
    sources: {},
    analyzingEntryIds: [],
    failedSources: {},
    uploads: {},
    analyzingUploadIds: [],
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
    add: (snapshots, sources = {}, uploads = {}) =>
      set((state) => {
        const byId = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
        for (const snapshot of snapshots) byId.set(snapshot.id, snapshot);
        const failedSources = { ...state.failedSources };
        for (const id of Object.keys(sources)) delete failedSources[id];
        const ready = Object.entries(uploads).map(([id, snapshotId]) => [
          id,
          { kind: "ready", snapshotId } satisfies UploadAnalysis,
        ]);
        return {
          failedSources,
          snapshots: [...byId.values()].sort(compareDescriptors),
          sources: { ...state.sources, ...sources },
          uploads: { ...state.uploads, ...Object.fromEntries(ready) },
        };
      }),
    removeSnapshots: () => set({ snapshots: [], sources: {}, uploads: {} }),
  };
}

/** What a session does to the analysis state when its worker fails or another campaign takes it. */
export function analysisSessionHandlers<D extends SnapshotDescriptor>(
  history: AnalysisHistory<D>,
): Pick<AnalysisWorkerOptions, "onFailure" | "onRelease"> {
  return {
    // The campaign stays paused, so it does not import again until the player resumes it.
    onFailure: (error, campaignId) => {
      const state = history.getState();
      state.cancel?.();
      state.removeSnapshots();
      if (campaignId) state.pauseAnalysis(campaignId);
      history.setState({ issues: [error.message] });
    },
    // Another campaign or game took the session. Its imports stop by themselves.
    onRelease: () => history.getState().removeSnapshots(),
  };
}
