import { useCallback } from "react";
import { useIsCampaignAnalysisEnabled } from "@/features/campaign/analysis/useIsCampaignAnalysisEnabled";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import {
  campaignAnalysisSourceKey,
  isEntryAnalyzed,
  useCampaignAutoAnalysis,
} from "@/features/campaign/analysis/autoAnalysis";
import { useEu5PlaythroughId } from "../store";
import { eu5Analysis } from "./analysisClient";
import { analyzeCampaign } from "./analyzeCampaign";
import { useHistory } from "./store";

export function pendingCampaignAnalysis(
  entries: readonly LocalSaveEntry[],
  playthroughId: string,
  attempted: ReadonlySet<string>,
) {
  const history = useHistory.getState();
  const stored = new Set(history.snapshots.map((row) => row.id));
  return entries
    .filter((entry) => !isEntryAnalyzed(entry, history.sources, stored))
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
  const pending = useCallback(
    (attempted: ReadonlySet<string>) =>
      playthroughId ? pendingCampaignAnalysis(entries, playthroughId, attempted) : [],
    [entries, playthroughId],
  );
  useCampaignAutoAnalysis({
    history: useHistory,
    claim: eu5Analysis.claim,
    playthroughId,
    featureEnabled,
    pending,
    analyze: analyzeCampaign,
  });
  return null;
}
