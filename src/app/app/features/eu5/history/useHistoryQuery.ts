import type { Remote } from "comlink";
import type { QueryReply } from "@/features/campaign/analysis/session";
import { useAnalysisQuery } from "@/features/campaign/analysis/useAnalysisQuery";
import type { analysisApi } from "./analysis-worker";
import { analysisGeneration, campaignAnalysis } from "./analysisClient";
import { useHistory } from "./store";

type Query<R> = (
  analysis: Remote<typeof analysisApi>,
  campaignId: string,
) => Promise<QueryReply<R>>;

/**
 * Run an EU5 history query in the analysis worker, and again when the campaign
 * gets more snapshots. `key` identifies the query and its arguments.
 */
export function useHistoryQuery<R>(campaignId: string | null, key: string, query: Query<R> | null) {
  const dataset = useHistory((state) =>
    campaignId
      ? state.snapshots
          .filter((row) => row.campaignId === campaignId)
          .map((row) => row.id)
          .join()
      : "",
  );
  return useAnalysisQuery<R>(analysisGeneration, {
    identity: `${campaignId}\u0000${key}`,
    dataset,
    run: campaignId && query && dataset ? () => query(campaignAnalysis(), campaignId) : null,
  });
}
