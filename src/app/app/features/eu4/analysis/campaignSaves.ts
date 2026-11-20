import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { CampaignAnalysisState } from "@/features/campaign/analysis/analysisState";
import { isEntryAnalyzed } from "@/features/campaign/analysis/autoAnalysis";
import {
  localSaveAnalysisStatus,
  localSaveSnapshotId,
} from "@/features/campaign/analysis/saveStatus";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";
import { saveProblemText } from "@/features/campaign/saveText";
import type { CampaignSave } from "@/features/campaign/types";
import type { Eu4SnapshotDescriptor } from "./analysisTypes";

/** A campaign save that analysis reads, and its snapshot when analysis has it. */
export type AnalysisSave = {
  save: CampaignSave;
  status: SaveAnalysisStatus;
  snapshot: Eu4SnapshotDescriptor | null;
  /** Why the save has no snapshot, when it failed. */
  error: string | null;
};

/**
 * The saves that analysis reads: the campaign list keeps one save per date,
 * and a save known to be of another campaign is left out.
 */
export function analysisCandidates(saves: readonly CampaignSave[]): CampaignSave[] {
  return saves.filter((save) => save.membership !== "different" && save.source.kind === "local");
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

/**
 * Each candidate with its analysis status and the snapshot of its current
 * version. The entries are those of the registry now.
 */
export function analysisSaves(
  saves: readonly CampaignSave[],
  state: Pick<
    CampaignAnalysisState<Eu4SnapshotDescriptor>,
    "sources" | "snapshots" | "failedSources" | "analyzingEntryIds"
  >,
  entries: readonly LocalSaveEntry[],
): AnalysisSave[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const byId = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const ready = new Set(byId.keys());
  return analysisCandidates(saves).map((save) => {
    const status = localSaveAnalysisStatus(save, state, ready) ?? "pending";
    const id = localSaveSnapshotId(save, state.sources);
    const entryId = save.source.kind === "local" ? save.source.entryId : null;
    const failure = entryId ? state.failedSources[entryId] : undefined;
    const problem = entryId ? entryById.get(entryId)?.problem : null;
    return {
      save,
      status,
      snapshot: status === "ready" && id ? (byId.get(id) ?? null) : null,
      error:
        status !== "failed"
          ? null
          : problem && problem.kind !== "moved"
            ? saveProblemText(problem)
            : (failure?.error ?? null),
    };
  });
}
