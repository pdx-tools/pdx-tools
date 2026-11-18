import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AnalysisQuery } from "@/features/campaign/analysis/query";
import type { QueryReply } from "@/features/campaign/analysis/session";

import { eu5Analysis } from "./analysisClient";
import { useHistory } from "./store";
import { useIsCampaignAnalysisEnabled } from "./useIsCampaignAnalysisEnabled";

/** Follow the campaign dataset using the shared query lifecycle and import throttle. */
export function useCampaignQuery<R>(
  campaignId: string | null,
  queryKey: object,
  run: (campaignId: string, identity: string, sequence: number) => Promise<QueryReply<R>>,
  requested = true,
) {
  const featureEnabled = useIsCampaignAnalysisEnabled();
  const enabled = useHistory(
    (state) =>
      featureEnabled && !!campaignId && state.analysisEnabledCampaigns.includes(campaignId),
  );
  const snapshots = useHistory((state) => state.snapshots);
  const ids = useMemo(
    () =>
      snapshots
        .filter((snapshot) => snapshot.campaignId === campaignId)
        .map((snapshot) => snapshot.id),
    [snapshots, campaignId],
  );
  const active = requested && enabled && ids.length > 0;
  const dataset = ids.join("\n");
  const identity = active ? JSON.stringify([campaignId, queryKey]) : "";
  const [subscription] = useState(() => new AnalysisQuery<R>(eu5Analysis.generation));
  useSyncExternalStore(subscription.subscribe, subscription.snapshot, subscription.snapshot);
  useEffect(() => () => subscription.deactivate(), [subscription]);
  useEffect(() => {
    if (!active || !campaignId) {
      subscription.deactivate();
      return;
    }
    subscription.update({
      identity,
      dataset,
      run: (identity, sequence) => run(campaignId, identity, sequence),
    });
  }, [subscription, identity, dataset, active, campaignId, run]);
  const state = subscription.current(identity);
  return { ...state, loading: active && state.result === null && state.error === null };
}
