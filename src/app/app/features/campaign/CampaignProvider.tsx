import { createContext, useContext, useState } from "react";
import { useCampaignNav } from "./useCampaignNav";
import type { CampaignAdapter, CampaignNav } from "./useCampaignNav";
import { publishCampaignTimeline } from "./campaignTimeline";
import type { PublishedCampaignTimeline } from "./campaignTimeline";
import type { OpenSave } from "./types";

const CampaignContext = createContext<CampaignNav | null>(null);
const CampaignTimelineContext = createContext<CampaignNav | null>(null);
const EMPTY_SAVES: CampaignNav["saves"] = [];

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
  const key = open && JSON.stringify([open.game, open.playthroughId]);
  const [published, setPublished] = useState<PublishedCampaignTimeline>({
    key: null,
    saves: EMPTY_SAVES,
  });
  const timeline = publishCampaignTimeline(
    published,
    key,
    nav?.saves ?? EMPTY_SAVES,
    nav?.pending ?? 0,
  );
  if (timeline !== published) setPublished(timeline);
  return (
    <CampaignContext.Provider value={nav}>
      <CampaignTimelineContext.Provider value={nav && { ...nav, saves: timeline.saves }}>
        {children}
      </CampaignTimelineContext.Provider>
    </CampaignContext.Provider>
  );
}

/** Hide campaign controls until another save is available or pending. */
export function useCampaign(): CampaignNav | null {
  const nav = useContext(CampaignContext);
  if (nav === null) return null;
  return nav.saves.length > 1 || nav.pending > 0 ? nav : null;
}

/** Timeline dates stay stable until the newly selected files have been identified. */
export function useCampaignTimeline(): CampaignNav | null {
  const nav = useContext(CampaignTimelineContext);
  if (nav === null) return null;
  return nav.saves.length > 1 || nav.pending > 0 ? nav : null;
}
