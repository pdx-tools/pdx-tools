import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { CampaignAnalysisState } from "@/features/campaign/analysis/analysisState";
import type { CampaignUpload } from "@/features/campaign/analysis/analyzeCampaign";
import { isEntryAnalyzed } from "@/features/campaign/analysis/autoAnalysis";
import {
  localSaveAnalysisStatus,
  localSaveSnapshotId,
} from "@/features/campaign/analysis/saveStatus";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";
import { saveProblemText } from "@/features/campaign/saveText";
import { sameFileVersion } from "@/features/campaign/types";
import type { CampaignSave } from "@/features/campaign/types";
import { descriptorDate } from "@/features/campaign/analysis/descriptor";
import type { DateComponents } from "@/features/timeline/date";
import type { Eu4SnapshotDescriptor } from "./analysisTypes";

/** A campaign save that analysis reads, and its snapshot when analysis has it. */
export type AnalysisSave = {
  save: CampaignSave;
  /** The date that the parse read, or the date of the campaign list before a parse. */
  date: DateComponents;
  status: SaveAnalysisStatus;
  snapshot: Eu4SnapshotDescriptor | null;
  /** Why the save has no snapshot, when it failed. */
  error: string | null;
  /** True when a retry can work, such as after a failed download. */
  retry: boolean;
};

type AnalysisState = Pick<
  CampaignAnalysisState<Eu4SnapshotDescriptor>,
  "sources" | "snapshots" | "failedSources" | "analyzingEntryIds" | "uploads" | "analyzingUploadIds"
>;

/**
 * The saves that analysis reads: the campaign list keeps one save per date,
 * and a save known to be of another campaign is left out. Where a date has
 * a local file and an upload, the list keeps the file, so nothing downloads.
 */
export function analysisCandidates(saves: readonly CampaignSave[]): CampaignSave[] {
  return saves.filter((save) => save.membership !== "different");
}

/** The registry entries of the candidates that analysis has not read in their current version. */
export function pendingEntries(
  saves: readonly CampaignSave[],
  state: Pick<CampaignAnalysisState, "sources" | "snapshots">,
): LocalSaveEntry[] {
  const stored = new Set(state.snapshots.map((snapshot) => snapshot.id));
  return analysisCandidates(saves).flatMap((save) => {
    const entry = save.source.kind === "local" && save.source.entryId;
    const current = entry ? localSaveRegistry.get(entry) : undefined;
    return current && !isEntryAnalyzed(current, state.sources, stored) ? [current] : [];
  });
}

/** The snapshot that a candidate is bound to: the one of its file version, or of its upload. */
function boundSnapshotId(
  save: CampaignSave,
  state: Pick<CampaignAnalysisState, "sources" | "uploads">,
): string | null {
  if (save.source.kind === "local") return localSaveSnapshotId(save, state.sources);
  const upload = state.uploads[save.source.saveId];
  return upload?.kind === "ready" ? upload.snapshotId : null;
}

/**
 * The snapshots that no candidate is bound to, on a date where a candidate
 * waits for analysis, such as a file that the game wrote again. The store
 * keeps one snapshot for each date, so these go before that analysis.
 */
export function replacedSnapshots(
  saves: readonly CampaignSave[],
  state: Pick<CampaignAnalysisState, "sources" | "uploads" | "snapshots">,
): string[] {
  const bound = new Set<string>();
  const waiting = new Set<number>();
  for (const save of analysisCandidates(saves)) {
    const id = boundSnapshotId(save, state);
    if (id) bound.add(id);
    else waiting.add(save.date.year * 10000 + save.date.month * 100 + save.date.day);
  }
  return state.snapshots
    .filter((snapshot) => !bound.has(snapshot.id) && waiting.has(snapshot.dateSort))
    .map((snapshot) => snapshot.id);
}

/** True when analysis failed on this version of the entry. */
export function failedInVersion(
  entry: LocalSaveEntry,
  failedSources: CampaignAnalysisState["failedSources"],
) {
  const failure = failedSources[entry.id];
  const version = entry.version ?? (entry.ref.kind === "file" ? entry.ref.file : null);
  return (
    !!failure &&
    (failure.version === null || (!!version && sameFileVersion(version, failure.version)))
  );
}

/** The uploads of the candidates without a snapshot, except those that could not be read. */
export function pendingUploads(
  saves: readonly CampaignSave[],
  state: Pick<CampaignAnalysisState, "uploads" | "snapshots">,
): CampaignUpload[] {
  const stored = new Set(state.snapshots.map((snapshot) => snapshot.id));
  return analysisCandidates(saves).flatMap((save) => {
    if (save.source.kind !== "upload") return [];
    const upload = state.uploads[save.source.saveId];
    const done =
      (upload?.kind === "ready" && stored.has(upload.snapshotId)) ||
      (upload?.kind === "failed" && upload.reason === "read");
    return done ? [] : [{ saveId: save.source.saveId, name: save.name }];
  });
}

/**
 * Each candidate with its analysis status and the snapshot of its current
 * version. The entries are those of the registry now.
 */
export function analysisSaves(
  saves: readonly CampaignSave[],
  state: AnalysisState,
  entries: readonly LocalSaveEntry[],
): AnalysisSave[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const byId = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const ready = new Set(byId.keys());
  return analysisCandidates(saves).map((save): AnalysisSave => {
    if (save.source.kind === "upload") {
      const { saveId } = save.source;
      const upload = state.uploads[saveId];
      const snapshot = upload?.kind === "ready" ? (byId.get(upload.snapshotId) ?? null) : null;
      const failed = upload?.kind === "failed" ? upload : null;
      return {
        save,
        date: snapshot ? descriptorDate(snapshot) : save.date,
        status: snapshot
          ? "ready"
          : state.analyzingUploadIds.includes(saveId)
            ? "analyzing"
            : failed
              ? "failed"
              : "pending",
        snapshot,
        error: failed && !snapshot ? failed.error : null,
        retry: failed?.reason === "download",
      };
    }
    const status = localSaveAnalysisStatus(save, state, ready) ?? "pending";
    const id = localSaveSnapshotId(save, state.sources);
    const entryId = save.source.entryId;
    const failure = entryId ? state.failedSources[entryId] : undefined;
    const problem = entryId ? entryById.get(entryId)?.problem : null;
    const snapshot = status === "ready" && id ? (byId.get(id) ?? null) : null;
    return {
      save,
      date: snapshot ? descriptorDate(snapshot) : save.date,
      status,
      snapshot,
      error:
        status !== "failed"
          ? null
          : problem && problem.kind !== "moved"
            ? saveProblemText(problem)
            : (failure?.error ?? null),
      retry: false,
    };
  });
}
