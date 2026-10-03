import type { MapMode } from "@/wasm/wasm_eu5";
import type { MapViewport } from "@pdx.tools/timelapse";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";

/** What the next EU5 save of the campaign keeps of the view. */
export type Eu5Carry = {
  mapMode: MapMode;
  viewport: MapViewport["viewport"] | null;
  insightPanel: { open: boolean; width: number };
  /**
   * The selection, by values that stay the same across saves. A country
   * carries by its tag, because its index can change. A location carries by
   * its index, because the map does not change. A market does not carry.
   */
  selection:
    | { kind: "players" }
    | { kind: "country"; tag: string; focusedLocation: number | null }
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

  // The camera comes last, so that nothing above moves it.
  if (carry.viewport !== null) {
    await engine.trigger.fitWorldRect(carry.viewport);
  }
}
