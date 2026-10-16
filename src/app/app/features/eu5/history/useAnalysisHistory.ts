import { useEffect, useState } from "react";
import { campaignAnalysis } from "./analysisClient";
import { useHistory } from "./store";
import type { HistoryQuery } from "./analysisTypes";
import type { Snapshot } from "./types";
/** Request only the country and market series currently shown by the history panel. */
export function useAnalysisHistory(query: HistoryQuery, enabled = true) {
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

export function useCountryMarketCenters(campaignId: string, country?: string): number[] | null {
  const revision = useHistory((state) => state.snapshots);
  const [result, setResult] = useState<{
    campaignId: string;
    country: string;
    centers: number[];
  } | null>(null);
  useEffect(() => {
    if (!country) return;
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
  }, [campaignId, country, revision]);
  return country
    ? result?.campaignId === campaignId && result.country === country
      ? result.centers
      : []
    : null;
}
