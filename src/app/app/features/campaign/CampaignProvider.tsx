import { createContext, useContext } from "react";
import { useCampaignNav } from "./useCampaignNav";
import type { CampaignAdapter, CampaignNav } from "./useCampaignNav";
import type { OpenSave } from "./types";

const CampaignContext = createContext<CampaignNav | null>(null);

type CampaignProviderProps = {
  open: OpenSave | null;
  adapter: CampaignAdapter;
  /** The error of the latest load, so that a step to a save that failed ends. */
  loadError?: unknown;
  children: React.ReactNode;
};

/**
 * The campaign of the open save, for the controls that step through it.
 * Without an open save that a campaign can hold, such as one with no
 * playthrough id, the controls do not show. The provider is always in the
 * tree, so a change of the open save does not mount its children again.
 */
export function CampaignProvider({ open, adapter, loadError, children }: CampaignProviderProps) {
  const nav = useCampaignNav(open, adapter, loadError);
  return <CampaignContext.Provider value={nav}>{children}</CampaignContext.Provider>;
}

/** The campaign, or null when it has only the open save. */
export function useCampaign(): CampaignNav | null {
  const nav = useContext(CampaignContext);
  if (nav === null) return null;
  return nav.saves.length > 1 || nav.pending > 0 || nav.refused > 0 ? nav : null;
}
