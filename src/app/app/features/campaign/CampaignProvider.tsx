import { createContext, useContext } from "react";
import { useCampaignNav } from "./useCampaignNav";
import type { CampaignAdapter, CampaignNav } from "./useCampaignNav";
import type { OpenSave } from "./types";

const CampaignContext = createContext<CampaignNav | null>(null);

type CampaignProviderProps = {
  open: OpenSave | null;
  adapter: CampaignAdapter;
  /** A load failure releases the pending step. */
  loadError?: unknown;
  children: React.ReactNode;
};

/** Keep campaign controls available across save changes without replacing the page. */
export function CampaignProvider({ open, adapter, loadError, children }: CampaignProviderProps) {
  const nav = useCampaignNav(open, adapter, loadError);
  return <CampaignContext.Provider value={nav}>{children}</CampaignContext.Provider>;
}

/** Hide campaign controls until another save is available or pending. */
export function useCampaign(): CampaignNav | null {
  const nav = useContext(CampaignContext);
  if (nav === null) return null;
  return nav.saves.length > 1 || nav.pending > 0 ? nav : null;
}
