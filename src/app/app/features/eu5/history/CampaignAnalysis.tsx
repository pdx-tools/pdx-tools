import { sameFileVersion } from "@/features/campaign/types";
import { useEffect, useRef } from "react";
import { useIsDeveloper } from "@/features/account";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { useEu5PlaythroughId } from "../store";
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
  const history = useHistory.getState();
  const completed = new Set(
    history.snapshots.filter((row) => row.campaignId === playthroughId).map((row) => row.hash),
  );
  return entries
    .filter((entry) => {
      const source = history.sources[entry.id];
      const version = entry.version ?? (entry.ref.kind === "file" ? entry.ref.file : null);
      return (
        !source ||
        !version ||
        !completed.has(source.hash) ||
        !sameFileVersion(version, source.version)
      );
    })
    .filter(
      (entry) =>
        entry.game === "eu5" &&
        (!entry.identity || entry.identity.playthroughId === playthroughId) &&
        !attempted.has(`${playthroughId}:${campaignAnalysisSourceKey(entry)}`),
    )
    .slice(0, 1000);
}

/** Analyze newly selected files in the background while campaign navigation stays available. */
export function CampaignAnalysis() {
  const entries = localSaveRegistry.useEntries();
  const isDeveloper = useIsDeveloper();
  const playthroughId = useEu5PlaythroughId();
  const paused = useHistory((state) => isAnalysisPaused(state, playthroughId));
  const progress = useHistory((state) => state.progress);
  const enabled = useHistory(
    (state) => !!playthroughId && state.analysisEnabledCampaigns.includes(playthroughId),
  );
  const attempted = useRef(new Set<string>());
  useEffect(() => {
    if (!isDeveloper || !enabled || !playthroughId || progress || paused) return;
    const pending = pendingCampaignAnalysis(entries, playthroughId, attempted.current);
    if (!pending.length) return;
    for (const entry of pending)
      attempted.current.add(`${playthroughId}:${campaignAnalysisSourceKey(entry)}`);
    void analyzeCampaign(pending, playthroughId)
      .catch((error) => {
        useHistory.setState({ issues: [String(error)] });
      })
      .finally(() => {
        // Identity reads may finish during analysis. Don't immediately retry failed files.
        for (const entry of pending) {
          const current = localSaveRegistry.get(entry.id);
          if (current)
            attempted.current.add(`${playthroughId}:${campaignAnalysisSourceKey(current)}`);
        }
      });
  }, [entries, playthroughId, progress, paused, isDeveloper, enabled]);
  return null;
}
