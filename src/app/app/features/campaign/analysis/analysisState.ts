import type { StoreApi } from "zustand";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { PointSource } from "./campaignStore";
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

/** A file version that resolved to a point, so a later read of it is known. */
export type FileVersionKey = FileVersion & { name: string };

/** One watch run of a local file. */
export type WatchSession = {
  /** The registry entry of the file, or null for a run of an earlier visit. */
  entryId: string | null;
  fileName: string;
  /** The run is of an earlier visit, which this browser kept. */
  restored?: true;
};

/** What this browser keeps of the campaign between visits. */
export type CampaignStoreStatus = {
  campaignId: string;
  /** The analysis generation that the kept points were restored into. */
  generation: number;
  state:
    | "ready"
    /** The index could not be read, so it is never written over. */
    | "unreadable"
    /** New points do not fit: the analysis bound or the browser's quota. */
    | "full"
    /** This browser gives no private files to the site. */
    | "unavailable";
  /** Kept points whose figures could not be read. */
  missing: number;
  /** The points this browser keeps. */
  kept: number;
};

/** Where a snapshot sits in the campaign: when it was seen, and what came before it. */
export type CampaignPoint = {
  /** The order this tab observed the points in. It orders points of one date. */
  seq: number;
  /** The previous watched write. Null for dropped files and uploads, which join by date. */
  parent: string | null;
  /** The watch run that wrote it. Null for dropped files and uploads. */
  session: string | null;
  sourceKeys: FileVersionKey[];
  /** Written to this browser's store: only Forget removes it. */
  kept?: true;
  /** Where a point of an earlier visit came from, as the store recorded it. */
  source?: PointSource;
};

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
  /** Every snapshot's place in the campaign, by snapshot ID. */
  points: Record<string, CampaignPoint>;
  /** The file that each watch run read, by session. */
  sessions: Record<string, WatchSession>;
  /** What this browser keeps of the claimed campaign, once restored. */
  stored: CampaignStoreStatus | null;
  /** The `seq` of the next point. */
  nextSeq: number;
  analysisEnabledCampaigns: readonly string[];
  enableAnalysis: (campaignId: string) => void;
  /** The campaigns that do not start imports until the player resumes them. */
  pausedCampaigns: Record<string, PauseReason>;
  pauseAnalysis: (campaignId: string, reason?: PauseReason) => void;
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
  /** Remove these snapshots and the source associations to them. */
  forget: (ids: readonly string[]) => void;
};

/** Why a campaign's reading stopped: the player stopped it, memory is full, or the worker failed. */
export type PauseReason = "stopped" | "full" | "failed";

export const withoutKey = <T>(record: Record<string, T>, key: string) => {
  const { [key]: _gone, ...rest } = record;
  return rest;
};

/** A zustand store that holds a campaign analysis. The store can hold more than the analysis. */
export type AnalysisHistory<D extends SnapshotDescriptor = SnapshotDescriptor> = StoreApi<
  CampaignAnalysisState<D>
>;

export function isAnalysisPaused(
  state: Pick<CampaignAnalysisState, "pausedCampaigns">,
  playthroughId: string | null | undefined,
) {
  return !!playthroughId && playthroughId in state.pausedCampaigns;
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
    points: {},
    sessions: {},
    stored: null,
    nextSeq: 0,
    analysisEnabledCampaigns: [],
    enableAnalysis: (campaignId) =>
      set((state) => ({
        analysisEnabledCampaigns: [...new Set([...state.analysisEnabledCampaigns, campaignId])],
        pausedCampaigns: withoutKey(state.pausedCampaigns, campaignId),
      })),
    pausedCampaigns: {},
    pauseAnalysis: (campaignId, reason = "stopped") =>
      set((state) => ({
        pausedCampaigns: { ...state.pausedCampaigns, [campaignId]: reason },
      })),
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
        // A new point joins by date until a watcher gives it a parent.
        const points = { ...state.points };
        let nextSeq = state.nextSeq;
        for (const { id } of snapshots)
          points[id] ??= { seq: nextSeq++, parent: null, session: null, sourceKeys: [] };
        for (const [entryId, { snapshotId, version }] of Object.entries(sources)) {
          const name = localSaveRegistry.get(entryId)?.name;
          const point = points[snapshotId];
          if (!point || name === undefined) continue;
          const known = point.sourceKeys.some(
            (x) =>
              x.name === name && x.size === version.size && x.lastModified === version.lastModified,
          );
          if (!known)
            points[snapshotId] = {
              ...point,
              sourceKeys: [...point.sourceKeys, { ...version, name }],
            };
        }
        return {
          points,
          nextSeq,
          failedSources,
          snapshots: [...byId.values()].sort(compareDescriptors),
          sources: { ...state.sources, ...sources },
          uploads: { ...state.uploads, ...Object.fromEntries(ready) },
        };
      }),
    removeSnapshots: () =>
      set({ snapshots: [], sources: {}, uploads: {}, points: {}, sessions: {}, stored: null }),
    forget: (ids) =>
      set((state) => {
        const gone = new Set(ids);
        return {
          snapshots: state.snapshots.filter((snapshot) => !gone.has(snapshot.id)),
          sources: Object.fromEntries(
            Object.entries(state.sources).filter(([, x]) => !gone.has(x.snapshotId)),
          ),
          uploads: Object.fromEntries(
            Object.entries(state.uploads).filter(
              ([, x]) => x.kind !== "ready" || !gone.has(x.snapshotId),
            ),
          ),
          points: Object.fromEntries(Object.entries(state.points).filter(([id]) => !gone.has(id))),
        };
      }),
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
      // Paused first, so the kept points are not read again before a resume.
      if (campaignId) state.pauseAnalysis(campaignId, "failed");
      state.removeSnapshots();
      history.setState({ issues: [error.message] });
    },
    // Another campaign or game took the session. Its imports stop by themselves.
    onRelease: () => history.getState().removeSnapshots(),
  };
}
