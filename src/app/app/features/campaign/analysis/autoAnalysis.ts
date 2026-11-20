import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { sameFileVersion } from "@/features/campaign/types";
import { analysisAdmission, IMPORT_BUSY_ERROR } from "./admission";
import { isAnalysisPaused } from "./analysisState";
import type { AnalysisHistory, CampaignAnalysisState } from "./analysisState";
import { entryVersion } from "./saveStatus";
import type { SnapshotDescriptor } from "./descriptor";

/** The entry and the file version that an analysis attempt read. */
export const campaignAnalysisSourceKey = (entry: LocalSaveEntry) => {
  const version = entryVersion(entry);
  return `${entry.id}:${version?.size}:${version?.lastModified}`;
};

/**
 * True when a stored snapshot came from this version of the entry. The store
 * keeps only the snapshots of the claimed campaign.
 */
export function isEntryAnalyzed(
  entry: LocalSaveEntry,
  sources: CampaignAnalysisState["sources"],
  stored: ReadonlySet<string>,
) {
  const source = sources[entry.id];
  const version = entryVersion(entry);
  return (
    !!source &&
    !!version &&
    stored.has(source.snapshotId) &&
    sameFileVersion(version, source.version)
  );
}

/**
 * Analyze new saves of an enabled campaign in the background while campaign
 * navigation stays available. The session keeps one campaign, so a change
 * of campaign claims it, and each visit starts again.
 */
export function useCampaignAutoAnalysis<D extends SnapshotDescriptor>({
  history,
  claim,
  playthroughId,
  featureEnabled,
  pending,
  analyze,
}: {
  history: AnalysisHistory<D>;
  claim: (campaignId: string) => void;
  playthroughId: string | null;
  featureEnabled: boolean;
  /** The entries to analyze, without those of the attempted source keys. Changes run it again. */
  pending: (attempted: ReadonlySet<string>) => LocalSaveEntry[];
  analyze: (entries: LocalSaveEntry[], playthroughId: string) => Promise<void>;
}) {
  const paused = useStore(history, (state) => isAnalysisPaused(state, playthroughId));
  const progress = useStore(history, (state) => state.progress);
  const enabled = useStore(
    history,
    (state) => !!playthroughId && state.analysisEnabledCampaigns.includes(playthroughId),
  );
  // The source versions that this visit tried to analyze.
  const attempted = useRef(new Set<string>());
  // Changes when the campaign changes. An import of an earlier visit then
  // does not mark its saves as attempted.
  const visit = useRef(0);
  useEffect(() => {
    if (!playthroughId) return;
    visit.current++;
    attempted.current = new Set();
    claim(playthroughId);
  }, [playthroughId, claim]);
  // Changes when an import of another game ends, so a refused import runs again.
  const [admitted, setAdmitted] = useState(0);
  useEffect(() => {
    if (!featureEnabled || !enabled || !playthroughId || progress || paused) return;
    const entries = pending(attempted.current);
    if (!entries.length) return;
    const keys = entries.map(campaignAnalysisSourceKey);
    for (const key of keys) attempted.current.add(key);
    const started = visit.current;
    let busy = false;
    void analyze(entries, playthroughId)
      .catch((error) => {
        if (error instanceof Error && error.name === IMPORT_BUSY_ERROR) {
          // Another import runs. These saves were not read, so try them when it ends.
          busy = true;
          for (const key of keys) attempted.current.delete(key);
          void analysisAdmission()
            .idle()
            .then(() => setAdmitted((x) => x + 1));
          return;
        }
        history.setState({ issues: [String(error)] });
      })
      .finally(() => {
        // The import records the version that it read, so a failed file is not
        // tried again at once. A newer version that navigation read meanwhile is.
        if (busy || visit.current !== started) return;
        const { sources, failedSources } = history.getState();
        for (const entry of entries) {
          const current = localSaveRegistry.get(entry.id);
          const version = current && entryVersion(current);
          const read = sources[entry.id]?.version ?? failedSources[entry.id]?.version;
          if (current && version && read && sameFileVersion(version, read))
            attempted.current.add(campaignAnalysisSourceKey(current));
        }
      });
  }, [
    pending,
    playthroughId,
    progress,
    paused,
    featureEnabled,
    enabled,
    analyze,
    history,
    admitted,
  ]);
}
