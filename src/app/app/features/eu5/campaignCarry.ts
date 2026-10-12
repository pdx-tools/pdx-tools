import type { MapMode } from "@/wasm/wasm_eu5";
import type { MapViewport } from "@pdx.tools/timelapse";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";

/** View state preserved across campaign saves. */
export type Eu5Carry = {
  mapMode: MapMode;
  viewport: MapViewport["viewport"] | null;
  insightPanel: { open: boolean; width: number };
  /**
   * Use country tags across saves because country indices can change.
   * Location indices remain stable within one map. Market selections are not restored.
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
    const tag = await engine.queries.getCountryTag(profile.country.key);
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

/** Restore the previous view before showing the next save. */
export async function applyEu5Carry(engine: AppEngine, carry: Eu5Carry): Promise<void> {
  if (carry.mapMode !== engine.state.currentMapMode) {
    await engine.trigger.selectMapMode(carry.mapMode);
  }

  const selection = carry.selection;
  if (selection?.kind === "players") {
    await engine.commands.selectPlayers();
  } else if (selection?.kind === "country") {
    const countryIdx = await engine.queries.findCountryByTag(selection.tag);
    if (countryIdx !== null) {
      await engine.commands.selectCountry(countryIdx);
      if (selection.focusedLocation !== null) {
        await engine.commands.setFocusedLocation(selection.focusedLocation);
      }
    }
  }

  // Restore the camera after selection changes so the view stays fixed.
  if (carry.viewport !== null) {
    await engine.trigger.fitWorldRect(carry.viewport);
  }
}
