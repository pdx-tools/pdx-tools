import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { AnalysisQuery } from "./query";
import type { AnalysisHistory } from "./analysisState";
import type { SnapshotDescriptor } from "./descriptor";
import type { AnswerValue, AnalysisStore, QueryOf, SnapshotSelection, TypesOf } from "./session";
import type { AnalysisWorkerClient } from "./workerClient";

/**
 * Run a game query on the snapshots of a campaign, or on the selected ones,
 * and run it again when snapshots arrive or leave. A null query does not run.
 */
export function useAnalysisQuery<S extends AnalysisStore, Q extends QueryOf<S>>(
  client: AnalysisWorkerClient<S>,
  history: AnalysisHistory<SnapshotDescriptor>,
  campaignId: string | null,
  query: Q | null,
  selection?: SnapshotSelection,
) {
  type R = AnswerValue<TypesOf<S>, Q["kind"]>;
  const snapshots = useStore(history, (state) => state.snapshots);
  const dataset = useMemo(
    () =>
      snapshots
        .filter((snapshot) => snapshot.campaignId === campaignId)
        .map((snapshot) => snapshot.id)
        .join("\n"),
    [snapshots, campaignId],
  );
  const active = !!campaignId && !!query && dataset !== "";
  const identity = active ? JSON.stringify([campaignId, query, selection]) : "";
  const [subscription] = useState(() => new AnalysisQuery<R>(client.generation));
  useSyncExternalStore(subscription.subscribe, subscription.snapshot, subscription.snapshot);
  useEffect(() => () => subscription.deactivate(), [subscription]);
  useEffect(() => {
    if (!active || !campaignId || !query) {
      subscription.deactivate();
      return;
    }
    subscription.update({
      identity,
      dataset,
      run: (identity, sequence) =>
        client.query({ campaignId, identity, sequence, query, selection }),
    });
    // An equal query keeps its identity, so it does not run again.
  }, [subscription, identity, dataset, active, campaignId, query, selection, client]);
  const state = subscription.current(identity);
  return { ...state, loading: active && state.result === null && state.error === null };
}
