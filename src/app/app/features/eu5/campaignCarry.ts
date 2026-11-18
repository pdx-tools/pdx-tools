import type { MapMode } from "@/wasm/wasm_eu5";
import type { MapViewport } from "@pdx.tools/timelapse";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";
import type { LocationClickChangeEvent } from "./workers/map/map-module";
import type { CountryIdentity } from "./carriedCountry";

export { findCarriedCountry } from "./carriedCountry";
export type { CountryIdentity } from "./carriedCountry";

/**
 * The selection by values that stay the same across saves. A country carries
 * by its identity, a market by the id of its center location, and a location
 * by its index, because the map does not change.
 */
export type CarriedSelection = {
  target:
    | { kind: "players" }
    | { kind: "countries"; countries: CountryIdentity[] }
    | { kind: "markets"; centers: number[] }
    | { kind: "locations"; locations: number[] };
  /** Kept only when the next save has it in the restored selection. */
  focusedLocation: number | null;
};

/** What the next EU5 save of the campaign keeps of the view. */
export type Eu5Carry = {
  /** A click on a snapshot, to apply after the save of the snapshot loads. */
  inspection?: { click: LocationClickChangeEvent };
  mapMode: MapMode;
  viewport: MapViewport["viewport"] | null;
  insightPanel: { open: boolean; width: number };
  selection: CarriedSelection | null;
};

export async function captureEu5Carry(store: Eu5Store): Promise<Eu5Carry> {
  const state = store.getState();
  const { appState, engine } = state;
  return {
    mapMode: appState.currentMapMode,
    viewport: appState.mapViewport?.viewport ?? null,
    insightPanel: { open: state.insightPanelOpen, width: state.insightPanelWidth },
    selection: await engine.trigger.getCarriedSelection(),
  };
}

/**
 * Bring the view of the previous save into this one, before the player
 * sees it. A country or market that is gone from this save leaves the
 * selection.
 */
export async function applyEu5Carry(engine: AppEngine, carry: Eu5Carry): Promise<void> {
  await engine.trigger.restoreCampaignView(carry);
  // The camera comes last, so that nothing above moves it.
  if (carry.viewport !== null) await engine.trigger.fitWorldRect(carry.viewport);
}
