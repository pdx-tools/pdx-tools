import { lazy, Suspense } from "react";
import { useIsCampaignAnalysisEnabled } from "./useIsCampaignAnalysisEnabled";

const MapHistoryProvider = lazy(() =>
  import("./MapHistory").then((module) => ({ default: module.MapHistoryProvider })),
);

/** Load the campaign history only for users that have the feature. */
export function CampaignAnalysisProvider({ children }: { children: React.ReactNode }) {
  const enabled = useIsCampaignAnalysisEnabled();
  if (!enabled) return children;
  return (
    <Suspense fallback={children}>
      <MapHistoryProvider>{children}</MapHistoryProvider>
    </Suspense>
  );
}
