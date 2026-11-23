import { useCallback, useMemo } from "react";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { useCampaignNavigation } from "@/features/campaign/CampaignProvider";
import { useCampaignAutoAnalysis } from "@/features/campaign/analysis/autoAnalysis";
import { useEu4Meta } from "../store";
import { eu4Analysis } from "./analysisClient";
import { importEu4Saves } from "./analyzeSaves";
import { pendingEntries } from "./campaignSaves";
import { useEu4Watch } from "../campaignWatch";
import { useEu4History } from "./store";
import { useCampaignStore } from "@/features/campaign/analysis/useCampaignStore";

/**
 * Keep the analysis session on the open campaign, and analyze local saves
 * that arrive after the player chose to analyze it. Uploads download only on
 * request, and a failed file waits until it changes.
 */
export function Eu4CampaignAnalysis() {
  const nav = useCampaignNavigation();
  const playthroughId = useEu4Meta().playthroughId;
  const saves = useMemo(() => nav?.saves ?? [], [nav?.saves]);
  // The watcher reads each write of its file, and keeps the earlier ones.
  const watched = useEu4Watch((state) => state.watching?.entryId);
  const pending = useCallback(
    () => pendingEntries(saves, useEu4History.getState()).filter((entry) => entry.id !== watched),
    [saves, watched],
  );
  const analyze = useCallback(
    (entries: LocalSaveEntry[], playthroughId: string) =>
      importEu4Saves(saves, playthroughId, entries),
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
  useCampaignStore({
    history: useEu4History,
    analysis: eu4Analysis,
    playthroughId,
  });
  return null;
}
