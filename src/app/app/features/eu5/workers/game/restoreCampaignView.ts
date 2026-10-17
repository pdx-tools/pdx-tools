import { findCarriedCountry } from "../../campaignCarry";
import type { Eu5Carry, StableProfile } from "../../campaignCarry";
import type { ActiveProfileIdentity, Eu5App, MapChangeData } from "@/wasm/wasm_eu5";

type Countries = ReturnType<Eu5App["get_countries"]>["countries"];
type ViewApp = Pick<
  Eu5App,
  | "set_map_mode"
  | "select_players"
  | "select_country"
  | "select_market"
  | "set_focused_location"
  | "market_id_at_center"
  | "get_market_profile"
  | "get_location_profile"
  | "get_selection_summary"
>;

/** Restore a campaign view within the game worker, before publishing its buffers. */
export function restoreCampaignView(app: ViewApp, countries: Countries, carry: Eu5Carry) {
  const change = app.set_map_mode(carry.mapMode);
  const merge = (next: MapChangeData) => {
    change.colorsChanged ||= next.colorsChanged;
    change.flagsChanged ||= next.flagsChanged;
    change.gradient = next.gradient;
  };
  const country = (identity: Extract<StableProfile, { kind: "country" }>) => {
    const key = findCarriedCountry(countries, identity);
    return countries.find((c) => c.country.key === key);
  };
  const selection = carry.selection;
  if (selection?.kind === "players") merge(app.select_players());
  else if (selection?.kind === "country") {
    const match = country(selection);
    if (match) {
      merge(app.select_country(match.country.key));
      if (selection.focusedLocation != null)
        merge(app.set_focused_location(selection.focusedLocation));
    }
  } else if (selection?.kind === "market") {
    const id = app.market_id_at_center(selection.center);
    if (id != null) merge(app.select_market(id));
  } else if (selection?.kind === "location") {
    merge(app.set_focused_location(selection.locationIdx));
  }

  return { change, selection: app.get_selection_summary() };
}

/** Resolve identities without building complete country profiles or searching locations. */
export function campaignIdentities(
  app: Pick<ViewApp, "get_market_profile">,
  countries: Countries,
  profiles: ActiveProfileIdentity[],
): (StableProfile | null)[] {
  return profiles.map((profile) => {
    if (profile.kind === "country") {
      const match = countries.find((c) => c.country.key === profile.country.key);
      return match ? { kind: "country", id: match.id, tag: match.tag } : null;
    }
    if (profile.kind === "market") {
      const market = app.get_market_profile(profile.market.key);
      return market ? { kind: "market", center: market.centerId } : null;
    }
    return { kind: "location", locationIdx: profile.location.key };
  });
}
