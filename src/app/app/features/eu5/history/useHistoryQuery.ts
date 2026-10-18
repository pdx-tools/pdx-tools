import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Remote } from "comlink";
import type { analysisApi } from "./analysis-worker";
import { campaignAnalysis } from "./analysisClient";
import { useHistory } from "./store";

/** During an import, a query runs again at most one time in this period. */
export const HISTORY_REFRESH_MS = 1000;

type Query<R> = (analysis: Remote<typeof analysisApi>, campaignId: string) => Promise<R>;

type QueryState<R> = { identity: string; result: R | null; error: string | null };

/** The number of snapshots that a result used, if it says. */
const snapshotsOf = (result: unknown) =>
  result &&
  typeof result === "object" &&
  "snapshots" in result &&
  typeof result.snapshots === "number"
    ? result.snapshots
    : -1;

/**
 * The wait before the query runs again. A new query runs now. The same query
 * runs again `HISTORY_REFRESH_MS` after its previous run.
 */
export function refreshDelay(
  previous: { identity: string; at: number } | null,
  identity: string,
  now: number,
) {
  if (previous?.identity !== identity) return 0;
  return Math.max(0, HISTORY_REFRESH_MS - (now - previous.at));
}

/** A slow result for fewer snapshots does not replace a newer result. */
export function acceptResult<R>(
  previous: QueryState<R>,
  identity: string,
  result: R,
): QueryState<R> {
  return previous.identity === identity &&
    previous.result !== null &&
    snapshotsOf(previous.result) > snapshotsOf(result)
    ? previous
    : { identity, result, error: null };
}

/**
 * Run a history query in the analysis worker. When the campaign gets more
 * snapshots, run it again, at most one time each `HISTORY_REFRESH_MS`. The
 * previous result stays until the next result arrives.
 *
 * A query has its own identity, `key`. The playhead is not part of it, so a
 * move of the playhead does not make a pending result invalid.
 */
export function useHistoryQuery<R>(campaignId: string | null, key: string, query: Query<R> | null) {
  const count = useHistory((state) =>
    campaignId ? state.snapshots.filter((row) => row.campaignId === campaignId).length : 0,
  );
  const enabled = !!campaignId && !!query && count > 0;
  const identity = `${campaignId}\u0000${key}`;
  const [state, setState] = useState<QueryState<R>>({ identity, result: null, error: null });
  const latest = useRef(identity);
  const lastRun = useRef<{ identity: string; at: number } | null>(null);

  const run = useEffectEvent(() => {
    if (!campaignId || !query) return;
    const requested = identity;
    lastRun.current = { identity: requested, at: performance.now() };
    void query(campaignAnalysis(), campaignId).then(
      (result) => {
        if (latest.current !== requested) return;
        setState((previous) => acceptResult(previous, requested, result));
      },
      (error) => {
        if (latest.current === requested)
          setState({ identity: requested, result: null, error: String(error) });
      },
    );
  });

  useEffect(() => {
    latest.current = identity;
    if (!enabled) return;
    const wait = refreshDelay(lastRun.current, identity, performance.now());
    if (!wait) {
      run();
      return;
    }
    const timer = setTimeout(run, wait);
    return () => clearTimeout(timer);
  }, [identity, count, enabled]);

  const current = state.identity === identity;
  return {
    result: current ? state.result : null,
    error: current ? state.error : null,
    loading: enabled && (!current || (!state.result && !state.error)),
  };
}
