import { useMemo } from "react";
import { useCampaignNavigation } from "@/features/campaign/CampaignProvider";
import { isAnalysisPaused } from "@/features/campaign/analysis/analysisState";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { useEu4Meta } from "@/features/eu4/store";
import { analyzeEu4Campaign } from "@/features/eu4/analysis/analyzeCampaign";
import { analysisSaves, pendingEntries } from "@/features/eu4/analysis/campaignSaves";
import { useEu4History } from "@/features/eu4/analysis/store";

/** The open campaign, the saves that analysis reads and what analysis has of them. */
export function useEu4Campaign() {
  const nav = useCampaignNavigation();
  const playthroughId = useEu4Meta().playthroughId;
  const entries = localSaveRegistry.useEntries();
  const snapshots = useEu4History((state) => state.snapshots);
  const sources = useEu4History((state) => state.sources);
  const failedSources = useEu4History((state) => state.failedSources);
  const analyzingEntryIds = useEu4History((state) => state.analyzingEntryIds);
  const progress = useEu4History((state) => state.progress);
  const issues = useEu4History((state) => state.issues);
  const cancel = useEu4History((state) => state.cancel);
  const paused = useEu4History((state) => isAnalysisPaused(state, playthroughId));
  const enabled = useEu4History(
    (state) => !!playthroughId && state.analysisEnabledCampaigns.includes(playthroughId),
  );
  const saves = useMemo(
    () =>
      analysisSaves(
        nav?.saves ?? [],
        {
          snapshots: snapshots.filter((snapshot) => snapshot.campaignId === playthroughId),
          sources,
          failedSources,
          analyzingEntryIds,
        },
        entries,
      ),
    [nav?.saves, snapshots, sources, failedSources, analyzingEntryIds, playthroughId, entries],
  );
  const analyze = () => {
    if (!playthroughId) return;
    const history = useEu4History.getState();
    history.enableAnalysis(playthroughId);
    // The first press hands over to the background analysis. Later ones retry now.
    if (!enabled) return;
    const pending = pendingEntries(nav?.saves ?? [], history);
    if (pending.length)
      void analyzeEu4Campaign(pending.slice(0, 1000), playthroughId).catch((error) =>
        useEu4History.setState({ issues: [String(error)] }),
      );
  };
  return {
    nav,
    playthroughId,
    saves,
    enabled,
    paused,
    progress,
    issues,
    stop: () => cancel?.(),
    analyze,
  };
}

export type Eu4Campaign = ReturnType<typeof useEu4Campaign>;
