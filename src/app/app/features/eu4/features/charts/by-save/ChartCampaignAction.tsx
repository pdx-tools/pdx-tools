import { useMemo } from "react";
import { CampaignListActionProvider } from "@/features/campaign/CampaignListAction";
import { useEu4Actions } from "@/features/eu4/store";

/** The campaign save list opens the world charts on development by save. */
export function ChartCampaignAction({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { setCharts } = useEu4Actions();
  const action = useMemo(
    () => ({
      label: "Chart this campaign",
      run: () => setCharts({ open: true, viz: "dev-by-save" }),
    }),
    [setCharts],
  );
  return (
    <CampaignListActionProvider value={enabled ? action : null}>
      {children}
    </CampaignListActionProvider>
  );
}
