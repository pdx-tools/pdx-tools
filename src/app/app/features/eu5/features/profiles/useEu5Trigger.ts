import type { OverviewData, OverviewKey } from "@/wasm/wasm_eu5";
import { useInsightPreview } from "../../history/insightPreview";
import { previewOverview } from "../../history/previewOverview";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DependencyList } from "react";
import { isAbortError } from "@/lib/abortController";
import { useEu5Engine, useEu5SelectionRevision } from "../../store";
import type { AppEngine } from "../../ui-engine";

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
  fetch: (engine: AppEngine) => Promise<T>,
  deps: DependencyList = [],
): { data: T | undefined; error: Error | undefined; loading: boolean } {
  const selectionRevision = useEu5SelectionRevision();
  return useEu5Trigger(fetch, [selectionRevision, ...deps]);
}

/** Use the shown snapshot's chart results while the loaded save stays beneath the preview. */
export function useEu5Overview<K extends OverviewKey>(
  key: K,
  fetch: (engine: AppEngine) => Promise<OverviewData[K]>,
) {
  const preview = useInsightPreview();
  const selection = useEu5SelectionRevision();
  const chart = useRef({});
  const query = useEu5Trigger(
    async (engine) => ({
      id: preview?.id,
      data: await (preview ? previewOverview(preview, key) : fetch(engine)),
    }),
    [key, preview?.id, preview?.campaignId, preview ? undefined : selection],
  );
  const shown = query.data?.id;
  useLayoutEffect(() => preview?.track(chart.current, shown), [preview, shown]);
  return { data: query.data?.data, error: query.error, loading: query.loading };
}
