import type { MapMode } from "@/wasm/wasm_eu5";
import type { MapViewport } from "@pdx.tools/timelapse";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";
import type { CountryIdentity } from "./carriedCountry";

/** View state preserved across campaign saves. */
export type Eu5Carry = {
  mapMode: MapMode;
  viewport: MapViewport["viewport"] | null;
  insightPanel: { open: boolean; width: number };
  /**
   * Country indices can change between saves, thus a country carries by its
   * ID and its tag. Location indices remain stable within one map. Markets
   * carry by their anchor because market IDs can change between saves.
   */
  selection:
    | { kind: "players" }
    | ({ kind: "country" } & CountryIdentity)
    | { kind: "market"; locationIdx: number }
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
    const country = await engine.queries.getCountryIdentity(profile.country.key);
    if (country) {
      carried = { kind: "country", ...country };
    }
  } else if (profile?.kind === "market") {
    const market = await engine.queries.getMarketProfile(profile.market.key);
    if (market) carried = { kind: "market", locationIdx: market.header.anchorLocationIdx };
  } else if (profile?.kind === "location") {
    carried = { kind: "location", locationIdx: profile.location.key };
  }

  return {
    mapMode: appState.currentMapMode,
    viewport: appState.mapViewport?.viewport ?? null,
    insightPanel: { open: state.insightPanelOpen, width: state.insightPanelWidth },
    selection: carried,
  };
}

/** Restore the previous view before showing the next save. */
export async function applyEu5Carry(engine: AppEngine, carry: Eu5Carry): Promise<void> {
  if (carry.mapMode !== engine.state.currentMapMode) {
    await engine.trigger.selectMapMode(carry.mapMode);
  }

  const selection = carry.selection;
  if (selection?.kind === "players") {
    await engine.commands.selectPlayers();
  } else if (selection?.kind === "country") {
    const countryIdx = await engine.queries.findCountry(selection);
    if (countryIdx !== null) {
      await engine.commands.selectCountry(countryIdx);
    }
  } else if (selection?.kind === "market") {
    await engine.commands.selectMarketAt(selection.locationIdx);
  } else if (selection?.kind === "location") {
    await engine.commands.setFocusedLocation(selection.locationIdx);
  }

  // Restore the camera after selection changes so the view stays fixed.
  if (carry.viewport !== null) {
    await engine.trigger.fitWorldRect(carry.viewport);
  }
}
