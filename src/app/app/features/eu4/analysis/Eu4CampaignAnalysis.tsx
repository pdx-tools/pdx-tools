import { useCallback } from "react";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { useCampaignNavigation } from "@/features/campaign/CampaignProvider";
import {
  campaignAnalysisSourceKey,
  useCampaignAutoAnalysis,
} from "@/features/campaign/analysis/autoAnalysis";
import { useEu4Meta } from "../store";
import { eu4Analysis } from "./analysisClient";
import { analyzeEu4Saves } from "./analyzeSaves";
import { failedInVersion, pendingEntries } from "./campaignSaves";
import { useEu4History } from "./store";

/**
 * Keep the analysis session on the open campaign, and analyze local saves
 * that arrive after the player chose to analyze it. Uploads download only on
 * request, and a failed file waits for a request until it changes.
 */
export function Eu4CampaignAnalysis() {
  const nav = useCampaignNavigation();
  const playthroughId = useEu4Meta().playthroughId;
  const saves = nav?.saves;
  const pending = useCallback(
    (attempted: ReadonlySet<string>) =>
      pendingEntries(saves ?? [], useEu4History.getState())
        .filter(
          (entry) =>
            !attempted.has(campaignAnalysisSourceKey(entry)) &&
            !failedInVersion(entry, useEu4History.getState().failedSources),
        )
        .slice(0, 1000),
    [saves],
  );
  const analyze = useCallback(
    (entries: LocalSaveEntry[], playthroughId: string) =>
      analyzeEu4Saves(saves ?? [], playthroughId, entries),
    [saves],
  );
  useCampaignAutoAnalysis({
    history: useEu4History,
    claim: eu4Analysis.claim,
    playthroughId,
    featureEnabled: true,
    pending,
    analyze,
  });
  return null;
}
