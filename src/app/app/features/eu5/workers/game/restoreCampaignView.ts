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
  const country = (tag: string) => countries.find((c) => c.tag === tag && c.capital != null);
  const selection = carry.selection;
  if (selection?.kind === "players") merge(app.select_players());
  else if (selection?.kind === "country") {
    const match = country(selection.tag);
    if (match) {
      merge(app.select_country(match.country.key));
      if (selection.focusedLocation !== null)
        merge(app.set_focused_location(selection.focusedLocation));
    }
  } else if (selection?.kind === "market") {
    const id = app.market_id_at_center(selection.center);
    if (id != null) merge(app.select_market(id));
  } else if (selection?.kind === "location") {
    merge(app.set_focused_location(selection.locationIdx));
  }

  const profiles: ActiveProfileIdentity[] = [];
  for (const profile of carry.profiles ?? []) {
    if (profile.kind === "country") {
      const match = country(profile.tag);
      if (!match) break;
      profiles.push({ kind: "country", country: match.country });
    } else if (profile.kind === "market") {
      const id = app.market_id_at_center(profile.center);
      const market = id == null ? null : app.get_market_profile(id);
      if (!market || id == null) break;
      profiles.push({ kind: "market", market: { key: id, name: market.header.name } });
    } else {
      const location = app.get_location_profile(profile.locationIdx);
      if (!location) break;
      profiles.push({ kind: "location", location: location.header.location });
    }
  }
  return { change, selection: app.get_selection_summary(), profiles };
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
      return match ? { kind: "country", tag: match.tag } : null;
    }
    if (profile.kind === "market") {
      const market = app.get_market_profile(profile.market.key);
      return market ? { kind: "market", center: market.centerId } : null;
    }
    return { kind: "location", locationIdx: profile.location.key };
  });
}
