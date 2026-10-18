import { useEffect, useState } from "react";
import { campaignAnalysis } from "./analysisClient";
import { useHistory } from "./store";
import { useIsCampaignAnalysisEnabled } from "./useIsCampaignAnalysisEnabled";
import type { HistoryQuery } from "./analysisTypes";
import type { Snapshot } from "./types";

function useAnalysisQueryEnabled(campaignId: string, requested: boolean) {
  const featureEnabled = useIsCampaignAnalysisEnabled();
  return useHistory(
    (state) => requested && featureEnabled && state.analysisEnabledCampaigns.includes(campaignId),
  );
}

/** Request only the country and market series currently shown by the history panel. */
export function useAnalysisHistory(query: HistoryQuery, requested = true) {
  const enabled = useAnalysisQueryEnabled(query.campaignId, requested);
  const revision = useHistory((state) => state.snapshots);
  const centers = JSON.stringify(query.centers ?? []);
  const key = JSON.stringify([query.campaignId, query.country, query.good, centers]);
  const [result, setResult] = useState<{
    key: string;
    revision: typeof revision;
    dates: Snapshot[];
    loading: boolean;
    error: string | null;
  }>({ key: "", revision, dates: [], loading: true, error: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void campaignAnalysis()
      .queryHistory({
        campaignId: query.campaignId,
        country: query.country,
        good: query.good,
        centers: JSON.parse(centers),
      })
      .then(
        (dates) => {
          if (!cancelled) setResult({ key, revision, dates, loading: false, error: null });
        },
        (error) => {
          if (!cancelled)
            setResult({ key, revision, dates: [], loading: false, error: String(error) });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [query.campaignId, query.country, query.good, centers, key, revision, enabled]);
  return enabled && result.key === key && result.revision === revision
    ? result
    : { dates: [], loading: enabled, error: null };
}

export function useCountryMarketCenters(
  campaignId: string,
  country?: string,
  requested = true,
): number[] | null {
  const enabled = useAnalysisQueryEnabled(campaignId, requested);
  const revision = useHistory((state) => state.snapshots);
  const [result, setResult] = useState<{
    campaignId: string;
    country: string;
    centers: number[];
  } | null>(null);
  useEffect(() => {
    if (!enabled || !country) return;
    let cancelled = false;
    void campaignAnalysis()
      .marketCenters(campaignId, country)
      .then(
        (centers) => {
          if (!cancelled) setResult({ campaignId, country, centers });
        },
        () => {
          if (!cancelled) setResult({ campaignId, country, centers: [] });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [campaignId, country, revision, enabled]);
  return country
    ? enabled && result?.campaignId === campaignId && result.country === country
      ? result.centers
      : []
    : null;
}
