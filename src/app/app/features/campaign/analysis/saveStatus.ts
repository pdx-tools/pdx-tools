import { localSaveRegistry } from "@/features/campaign/localSaves";
import { sameFileVersion } from "@/features/campaign/types";
import type { CampaignSave } from "@/features/campaign/types";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";
import type { CampaignAnalysisState } from "./analysisState";

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
  const source = state.sources[save.source.entryId];
  const entry = localSaveRegistry.get(save.source.entryId);
  const version = entry?.ref.kind === "file" ? entry.ref.file : entry?.version;
  if (
    !!source &&
    !!version &&
    sameFileVersion(version, source.version) &&
    !!readyIds?.has(source.snapshotId)
  )
    return "ready";
  if (state.analyzingEntryIds.includes(save.source.entryId)) return "analyzing";
  const failure = state.failedSources[save.source.entryId];
  if (entry?.problem && entry.problem.kind !== "moved") return "failed";
  if (
    failure &&
    (failure.version === null || (!!version && sameFileVersion(version, failure.version)))
  )
    return "failed";
  return "pending";
}
