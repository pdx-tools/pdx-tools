import { useEffect, useState } from "react";
import type { DependencyList } from "react";
import { useEu5Engine, useEu5SelectionRevision } from "../store";
import type { AppEngine } from "../ui-engine";

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
    void fetch(engine)
      .then((result) => {
        if (!cancelled) {
          setData(result ?? undefined);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setData(undefined);
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ...deps]);

  return { data, error, loading };
}

export function useEu5SelectionTrigger<T>(
  fetch: (engine: AppEngine) => Promise<T>,
  deps: DependencyList = [],
): { data: T | undefined; error: Error | undefined; loading: boolean } {
  const selectionRevision = useEu5SelectionRevision();
  return useEu5Trigger(fetch, [selectionRevision, ...deps]);
}
