import { useEffect, useState, useSyncExternalStore } from "react";
import { AnalysisQuery } from "./query";
import type { QueryInput } from "./query";

/** Subscribe to a query of an analysis session. See `AnalysisQuery`. */
export function useAnalysisQuery<R>(generation: () => number, input: QueryInput<R>) {
  const [query] = useState(() => new AnalysisQuery<R>(generation));
  useEffect(() => () => query.dispose(), [query]);
  // The run function changes on each render, so give the latest one each time.
  useEffect(() => query.update(input));
  const state = useSyncExternalStore(query.subscribe, query.snapshot, query.snapshot);
  const current = state.identity === input.identity;
  return {
    result: current ? state.result : null,
    error: current ? state.error : null,
    loading: !!input.run && (!current || (!state.result && !state.error)),
  };
}
