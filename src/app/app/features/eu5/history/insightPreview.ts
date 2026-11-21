import { createContext, useContext, useMemo, useState } from "react";

/** The accepted map frame and which frame supplied each visible overview. */
export type InsightPreview = {
  campaignId: string;
  id: string;
  track: (chart: object, snapshotId: string | undefined) => () => void;
  canInspect: () => boolean;
};

export const InsightPreviewContext = createContext<InsightPreview | null>(null);

export function useInsightPreview() {
  return useContext(InsightPreviewContext);
}

export function useInsightPreviewValue(campaignId?: string, id?: string): InsightPreview | null {
  const [tracked] = useState(() => new Map<object, string | undefined>());
  return useMemo(() => {
    if (!campaignId || !id) return null;
    return {
      campaignId,
      id,
      track: (chart, snapshotId) => {
        tracked.set(chart, snapshotId);
        return () => {
          tracked.delete(chart);
        };
      },
      canInspect: () => tracked.size > 0 && [...tracked.values()].every((shown) => shown === id),
    };
  }, [campaignId, id, tracked]);
}
