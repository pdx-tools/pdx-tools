import { sameFileVersion } from "@/features/campaign/types";
import { useEffect, useRef } from "react";
import { useIsCampaignAnalysisEnabled } from "./useIsCampaignAnalysisEnabled";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { useEu5PlaythroughId } from "../store";
import { eu5Analysis } from "./analysisClient";
import { analyzeCampaign } from "./analyzeCampaign";
import { isAnalysisPaused, useHistory } from "./store";

export const campaignAnalysisSourceKey = (entry: LocalSaveEntry) => {
  const version = entry.version ?? (entry.ref.kind === "file" ? entry.ref.file : null);
  return `${entry.id}:${version?.size}:${version?.lastModified}`;
};

export function pendingCampaignAnalysis(
  entries: readonly LocalSaveEntry[],
  playthroughId: string,
  attempted: ReadonlySet<string>,
) {
  // The store keeps only the snapshots of the claimed campaign.
  const history = useHistory.getState();
  const completed = new Set(history.snapshots.map((row) => row.id));
  return entries
    .filter((entry) => {
      const source = history.sources[entry.id];
      const version = entry.version ?? (entry.ref.kind === "file" ? entry.ref.file : null);
      return (
        !source ||
        !version ||
        !completed.has(source.snapshotId) ||
        !sameFileVersion(version, source.version)
      );
    })
    .filter(
      (entry) =>
        entry.game === "eu5" &&
        (!entry.identity || entry.identity.playthroughId === playthroughId) &&
        !attempted.has(campaignAnalysisSourceKey(entry)),
    )
    .slice(0, 1000);
}

/** Analyze newly selected files in the background while campaign navigation stays available. */
export function CampaignAnalysis() {
  const entries = localSaveRegistry.useEntries();
  const featureEnabled = useIsCampaignAnalysisEnabled();
  const playthroughId = useEu5PlaythroughId();
  const paused = useHistory((state) => isAnalysisPaused(state, playthroughId));
  const progress = useHistory((state) => state.progress);
  const enabled = useHistory(
    (state) => !!playthroughId && state.analysisEnabledCampaigns.includes(playthroughId),
  );
  // The source versions that this visit tried to analyze.
  const attempted = useRef(new Set<string>());
  // Changes when the campaign changes. An import of an earlier visit then
  // does not mark its saves as attempted.
  const visit = useRef(0);
  // The tab keeps the analysis of one campaign. Another campaign releases it,
  // so each visit starts again and analyzes its saves.
  useEffect(() => {
    if (!playthroughId) return;
    visit.current++;
    attempted.current = new Set();
    eu5Analysis.claim(playthroughId);
  }, [playthroughId]);
  useEffect(() => {
    if (!featureEnabled || !enabled || !playthroughId || progress || paused) return;
    const pending = pendingCampaignAnalysis(entries, playthroughId, attempted.current);
    if (!pending.length) return;
    for (const entry of pending) attempted.current.add(campaignAnalysisSourceKey(entry));
    const started = visit.current;
    void analyzeCampaign(pending, playthroughId)
      .catch((error) => {
        useHistory.setState({ issues: [String(error)] });
      })
      .finally(() => {
        // Identity reads may finish during analysis. Don't immediately retry failed files.
        if (visit.current !== started) return;
        for (const entry of pending) {
          const current = localSaveRegistry.get(entry.id);
          if (current) attempted.current.add(campaignAnalysisSourceKey(current));
        }
      });
  }, [entries, playthroughId, progress, paused, featureEnabled, enabled]);
  return null;
}
