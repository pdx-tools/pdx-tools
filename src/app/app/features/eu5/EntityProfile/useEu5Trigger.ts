import { useEffect, useState } from "react";
import type { DependencyList } from "react";
import { useEu5Engine } from "../store";
import type { AppEngine } from "../ui-engine";

export function useEu5Trigger<T>(
  fetch: (engine: AppEngine) => Promise<T>,
  deps: DependencyList,
): { data: T | undefined; loading: boolean } {
  const engine = useEu5Engine();
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(engine).then((result) => {
      if (!cancelled) {
        setData(result ?? undefined);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ...deps]);

  return { data, loading };
}
