import { useEffect, useState } from "react";
import type { DependencyList } from "react";
import { isAbortError } from "@/lib/abortController";
import { useEu5Engine, useEu5SelectionRevision } from "../../store";
import type { AppEngine } from "../../ui-engine";
import { useMapHistory } from "../../history/context";
import { overviewQueries } from "../../history/overviewQueries";

export function useEu5Trigger<T>(
  fetch: (engine: AppEngine) => Promise<T>,
  deps: DependencyList,
): { data: T | undefined; error: Error | undefined; loading: boolean } {
  const engine = useEu5Engine();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void fetch(engine).then(
      (result) => {
        if (cancelled) return;
        setData(result ?? undefined);
        setLoading(false);
      },
      (err: unknown) => {
        // A released save rejects with an abort. Keep loading until the next save shows.
        if (cancelled || isAbortError(err)) return;
        setData(undefined);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ...deps]);

  return { data, error, loading };
}

export function useEu5SelectionTrigger<T>(
  fetch: (engine: Pick<AppEngine, "queries">) => Promise<T>,
  deps: DependencyList = [],
): { data: T | undefined; error: Error | undefined; loading: boolean } {
  const selectionRevision = useEu5SelectionRevision();
  const hash = useMapHistory()?.preview?.shown?.hash;
  return useEu5Trigger(
    (engine) => fetch({ queries: hash ? overviewQueries(engine.queries, hash) : engine.queries }),
    [selectionRevision, hash, ...deps],
  );
}
