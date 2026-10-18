import type { ActiveProfileIdentity, MapMode } from "@/wasm/wasm_eu5";
import { useEu5SelectionState } from "../store";
import { usePanelNav } from "../features/profiles/PanelNavContext";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { CampaignHistory } from "./CampaignHistory";
import type { HistoryFocus } from "./CampaignHistory";
import { useMapHistory } from "./context";

const WORLD: HistoryFocus = { kind: "world" };
const NOT_ON_MAP = 0xffffffff;

/**
 * The profile that the panel shows, as an identity that all snapshots share.
 * A preview does not change the selection of the loaded save, so the focus
 * stays during a preview.
 */
function useHistoryFocus(): HistoryFocus {
  const nav = usePanelNav();
  const selection = useEu5SelectionState();
  const profile = nav.top?.profile ?? selection?.activeProfile ?? null;
  const { data } = useEu5Trigger(
    async (engine): Promise<HistoryFocus> => {
      if (profile?.kind === "country") {
        const country = await engine.queries.getCountryIdentity(profile.country.key);
        return country ? { kind: "country", id: country.id, name: profile.country.name } : WORLD;
      }
      if (profile?.kind === "market") {
        const market = await engine.queries.getMarketProfile(profile.market.key);
        return market
          ? { kind: "market", center: market.centerId, name: profile.market.name }
          : WORLD;
      }
      if (profile?.kind === "location") {
        const [id] = await engine.queries.getLocationIds([profile.location.key]);
        return id !== undefined && id !== NOT_ON_MAP
          ? { kind: "location", ids: [id], name: profile.location.name }
          : WORLD;
      }
      return WORLD;
    },
    [profile?.kind, profileKey(profile)],
  );
  return data ?? WORLD;
}

function profileKey(profile: ActiveProfileIdentity | null) {
  if (!profile) return null;
  if (profile.kind === "country") return profile.country.key;
  if (profile.kind === "market") return profile.market.key;
  return profile.location.key;
}

/** The campaign history in the insight panel. */
export function PanelHistory({ mode }: { mode: MapMode }) {
  const history = useMapHistory();
  const focus = useHistoryFocus();
  if (!history?.campaignId) return null;
  return (
    <CampaignHistory
      campaignId={history.campaignId}
      mode={mode}
      focus={focus}
      playheadHash={history.shownHash}
      onSelectSnapshot={history.showSnapshot ?? undefined}
    />
  );
}
