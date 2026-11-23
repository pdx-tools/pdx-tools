import { useMemo } from "react";
import { useEu4Watch } from "@/features/eu4/campaignWatch";
import { useEu4History } from "@/features/eu4/analysis/store";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";

/** The first column of the watched session, or -1 when no column is of it. */
export function useWatchStart(columns: readonly AnalysisSave[]) {
  const session = useEu4Watch((state) => state.watching?.session ?? null);
  const points = useEu4History((state) => state.points);
  return useMemo(
    () =>
      session === null
        ? -1
        : columns.findIndex((x) => !!x.snapshot && points[x.snapshot.id]?.session === session),
    [session, points, columns],
  );
}
