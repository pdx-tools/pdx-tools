import { useHistory } from "./history/store";
import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import type { MapMode } from "@/wasm/wasm_eu5";
import type { MapViewport } from "@pdx.tools/timelapse";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";

type StableProfile =
  | { kind: "country"; tag: string }
  | { kind: "market"; center: number }
  | { kind: "location"; locationIdx: number };

async function captureProfile(
  engine: AppEngine,
  profile: ActiveProfileIdentity,
): Promise<StableProfile | null> {
  if (profile.kind === "country") {
    const tag = (await engine.trigger.getCountryProfile(profile.country.key))?.header.tag;
    return tag ? { kind: "country", tag } : null;
  }
  if (profile.kind === "market") {
    const market = await engine.trigger.getMarketProfile(profile.market.key);
    return market ? { kind: "market", center: market.centerId } : null;
  }
  return { kind: "location", locationIdx: profile.location.key };
}

async function resolveProfile(
  engine: AppEngine,
  profile: StableProfile,
): Promise<ActiveProfileIdentity | null> {
  if (profile.kind === "country") {
    const results = await engine.trigger.searchEntities(profile.tag);
    const match = results.find((item) => item.kind === "country" && item.tag === profile.tag);
    return match ? { kind: "country", country: { key: match.id, name: match.name } } : null;
  }
  if (profile.kind === "market") {
    const id = await engine.trigger.getMarketIdAtCenter(profile.center);
    const market = id == null ? null : await engine.trigger.getMarketProfile(id);
    return market && id != null
      ? { kind: "market", market: { key: id, name: market.header.name } }
      : null;
  }
  const location = await engine.trigger.getLocationProfile(profile.locationIdx);
  return location
    ? {
        kind: "location",
        location: { key: profile.locationIdx, name: location.header.location.name },
      }
    : null;
}

/** What the next EU5 save of the campaign keeps of the view. */
export type Eu5Carry = {
  profiles?: StableProfile[];
  mapMode: MapMode;
  viewport: MapViewport["viewport"] | null;
  insightPanel: { open: boolean; width: number };
  /**
   * The selection, by values that stay the same across saves. A country
   * carries by its tag, because its index can change. A location carries by
   * its index, because the map does not change. A market carries by its center.
   */
  selection:
    | { kind: "players" }
    | { kind: "country"; tag: string; focusedLocation: number | null }
    | { kind: "market"; center: number }
    | { kind: "location"; locationIdx: number }
    | null;
};

export async function captureEu5Carry(store: Eu5Store): Promise<Eu5Carry> {
  const state = store.getState();
  const { appState, engine } = state;
  const selection = appState.selectionState;
  const profile = selection?.activeProfile;

  let carried: Eu5Carry["selection"] = null;
  if (selection?.preset === "players") {
    carried = { kind: "players" };
  } else if (profile?.kind === "country") {
    const country = await engine.trigger.getCountryProfile(profile.country.key);
    const tag = country?.header.tag;
    if (tag) {
      carried = { kind: "country", tag, focusedLocation: selection?.focusedLocation ?? null };
    }
  }

  if (profile?.kind === "market" || profile?.kind === "location") {
    const stable = await captureProfile(engine, profile);
    if (stable?.kind === "market" || stable?.kind === "location") carried = stable;
  }
  const profiles: StableProfile[] = [];
  for (const viewed of useHistory.getState().viewedProfiles) {
    const stable = await captureProfile(engine, viewed);
    if (!stable) break;
    profiles.push(stable);
  }
  return {
    profiles,
    mapMode: appState.currentMapMode,
    viewport: appState.mapViewport?.viewport ?? null,
    insightPanel: { open: state.insightPanelOpen, width: state.insightPanelWidth },
    selection: carried,
  };
}

/**
 * Bring the view of the previous save into this one, before the player
 * sees it. A country that is gone from this save leaves the selection
 * empty.
 */
export async function applyEu5Carry(
  engine: AppEngine,
  carry: Eu5Carry,
): Promise<ActiveProfileIdentity[]> {
  if (carry.mapMode !== engine.state.currentMapMode) {
    await engine.trigger.selectMapMode(carry.mapMode);
  }

  const selection = carry.selection;
  if (selection?.kind === "players") {
    await engine.trigger.selectPlayers();
  } else if (selection?.kind === "country") {
    const results = await engine.trigger.searchEntities(selection.tag);
    const match = results.find((x) => x.kind === "country" && x.tag === selection.tag);
    if (match) {
      await engine.trigger.selectCountry(match.id);
      if (selection.focusedLocation !== null) {
        await engine.trigger.setFocusedLocation(selection.focusedLocation);
      }
    }
  }

  if (selection?.kind === "market") {
    const id = await engine.trigger.getMarketIdAtCenter(selection.center);
    if (id != null) await engine.trigger.selectMarket(id);
  } else if (selection?.kind === "location") {
    await engine.trigger.setFocusedLocation(selection.locationIdx);
  }
  const profiles: ActiveProfileIdentity[] = [];
  for (const profile of carry.profiles ?? []) {
    const remapped = await resolveProfile(engine, profile);
    if (!remapped) break;
    profiles.push(remapped);
  }
  // The camera comes last, so that nothing above moves it.
  if (carry.viewport !== null) {
    await engine.trigger.fitWorldRect(carry.viewport);
  }
  return profiles;
}
