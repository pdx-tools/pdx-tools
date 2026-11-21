import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { FileVersion } from "@/features/campaign/types";
import { sameFileVersion } from "@/features/campaign/types";
import type { CampaignSave } from "@/features/campaign/types";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";
import type { CampaignAnalysisState } from "./analysisState";

/**
 * The file version of an entry: the one that the registry last read, or the
 * version of a held file before any read.
 */
export function entryVersion(entry: LocalSaveEntry): FileVersion | null {
  return entry.version ?? (entry.ref.kind === "file" ? entry.ref.file : null);
}

/** True when analysis failed on the current version of the entry. */
export function failedInVersion(
  entry: LocalSaveEntry,
  failure: CampaignAnalysisState["failedSources"][string] | undefined,
) {
  const version = entryVersion(entry);
  return (
    !!failure &&
    (failure.version === null || (!!version && sameFileVersion(version, failure.version)))
  );
}

/** The snapshot of the current file version of a local campaign save, if analysis has it. */
export function localSaveSnapshotId(
  save: CampaignSave,
  sources: CampaignAnalysisState["sources"],
): string | null {
  if (save.source.kind !== "local" || !save.source.entryId) return null;
  const source = sources[save.source.entryId];
  const entry = localSaveRegistry.get(save.source.entryId);
  const version = entry && entryVersion(entry);
  return source && version && sameFileVersion(version, source.version) ? source.snapshotId : null;
}

/**
 * The analysis status of a local campaign save. A save is ready when the
 * snapshot of its current file version is ready. Other sources have none.
 */
export function localSaveAnalysisStatus(
  save: CampaignSave,
  state: Pick<CampaignAnalysisState, "sources" | "failedSources" | "analyzingEntryIds">,
  readyIds: ReadonlySet<string> | undefined,
): SaveAnalysisStatus | undefined {
  if (save.source.kind !== "local" || !save.source.entryId) return undefined;
  // Analysis never includes a save of another campaign, so it never waits for one.
  if (save.membership === "different") return undefined;
  const snapshotId = localSaveSnapshotId(save, state.sources);
  if (snapshotId !== null && !!readyIds?.has(snapshotId)) return "ready";
  const entry = localSaveRegistry.get(save.source.entryId);
  if (state.analyzingEntryIds.includes(save.source.entryId)) return "analyzing";
  if (entry?.problem && entry.problem.kind !== "moved") return "failed";
  const failure = state.failedSources[save.source.entryId];
  if (entry ? failedInVersion(entry, failure) : !!failure) return "failed";
  return "pending";
}
