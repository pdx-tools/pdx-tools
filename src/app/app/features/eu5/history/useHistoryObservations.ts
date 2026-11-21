import { useMemo } from "react";
import type { Eu5Query } from "@/wasm/wasm_eu5";
import { useHistory } from "./store";
import { eu5Analysis } from "./analysisClient";
import { useCampaignQuery } from "./useCampaignQuery";
import type { HistoryObservation } from "./observations";

type Scope = Omit<Extract<Eu5Query, { kind: "campaignHistory" }>, "kind">;
const EMPTY: HistoryObservation[] = [];

export function useHistoryObservations(campaignId: string | null, scope: Scope, requested = true) {
  const { result, error, loading } = useCampaignQuery(
    campaignId,
    scope,
    (campaignId, identity, sequence) =>
      eu5Analysis.query({
        campaignId,
        identity,
        sequence,
        query: { kind: "campaignHistory", ...scope },
      }),
    requested,
  );
  const snapshots = useHistory((state) => state.snapshots);
  const dates = useMemo(() => {
    if (!result || !campaignId) return EMPTY;
    const hashes = new Map(snapshots.map(({ id, contentHash }) => [id, contentHash]));
    return result.flatMap((observation) => {
      const contentHash = hashes.get(observation.id);
      return contentHash === undefined ? [] : [{ ...observation, campaignId, contentHash }];
    });
  }, [campaignId, result, snapshots]);
  return { dates, error, loading };
}
