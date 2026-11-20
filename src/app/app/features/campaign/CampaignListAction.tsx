import { createContext, useContext } from "react";

/** An action that a game adds to the campaign save list, such as a chart of the campaign. */
export type CampaignListAction = { label: string; run: () => void };

const CampaignListActionContext = createContext<CampaignListAction | null>(null);

export const CampaignListActionProvider = CampaignListActionContext.Provider;

export function useCampaignListAction() {
  return useContext(CampaignListActionContext);
}
