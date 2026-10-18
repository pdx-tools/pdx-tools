import type { MapMode, UiCountryId } from "@/wasm/wasm_eu5";
import type { MapViewport } from "@pdx.tools/timelapse";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";
import type { LocationClickChangeEvent } from "./workers/map/map-module";

export { findCarriedCountry } from "./carriedCountry";
export type { CountryIdentity } from "./carriedCountry";

export type StableProfile =
  | { kind: "country"; id?: UiCountryId; tag: string }
  | { kind: "market"; center: number }
  | { kind: "location"; locationIdx: number };

/** What the next EU5 save of the campaign keeps of the view. */
export type Eu5Carry = {
  /** A click on a snapshot, to apply after the save of the snapshot loads. */
  inspection?: { click: LocationClickChangeEvent };
  mapMode: MapMode;
  viewport: MapViewport["viewport"] | null;
  insightPanel: { open: boolean; width: number };
  /**
   * The selection, by values that stay the same across saves. A country
   * carries by its stable ID first, and falls back to the tag for legacy carry. A location carries by
   * its index, because the map does not change. A market carries by its center.
   */
  selection:
    | { kind: "players" }
    | { kind: "country"; id?: UiCountryId; tag: string; focusedLocation: number | null }
    | { kind: "market"; center: number }
    | { kind: "location"; locationIdx: number }
    | null;
};

export async function captureEu5Carry(store: Eu5Store): Promise<Eu5Carry> {
  const state = store.getState();
  const { appState, engine } = state;
  const selection = appState.selectionState;
  const selected = selection?.preset === "players" ? undefined : selection?.activeProfile;
  const requested = selected ? [selected] : [];
  const identities = requested.length ? await engine.trigger.getCampaignIdentities(requested) : [];
  let carried: Eu5Carry["selection"] = selection?.preset === "players" ? { kind: "players" } : null;
  if (selected) {
    const stable = identities.shift();
    if (stable?.kind === "country")
      carried = { ...stable, focusedLocation: selection?.focusedLocation ?? null };
    else if (stable) carried = stable;
  }
  return {
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
export async function applyEu5Carry(engine: AppEngine, carry: Eu5Carry): Promise<void> {
  await engine.trigger.restoreCampaignView(carry);
  // The camera comes last, so that nothing above moves it.
  if (carry.viewport !== null) await engine.trigger.fitWorldRect(carry.viewport);
}
