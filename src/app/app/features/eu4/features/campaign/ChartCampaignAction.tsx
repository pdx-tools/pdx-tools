import { useMemo } from "react";
import { CampaignListActionProvider } from "@/features/campaign/CampaignListAction";
import { useEu4Actions } from "@/features/eu4/store";

/** The campaign save list opens the campaign sheet. */
export function ChartCampaignAction({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { setCampaignSheet } = useEu4Actions();
  const action = useMemo(
    () => ({
      label: "Chart this campaign",
      run: () => setCampaignSheet({ open: true }),
    }),
    [setCampaignSheet],
  );
  return (
    <CampaignListActionProvider value={enabled ? action : null}>
      {children}
    </CampaignListActionProvider>
  );
}
