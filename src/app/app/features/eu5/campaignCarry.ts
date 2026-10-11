import { useHistory } from "./history/store";
import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import type { MapMode } from "@/wasm/wasm_eu5";
import type { MapViewport } from "@pdx.tools/timelapse";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";

export type StableProfile =
  | { kind: "country"; tag: string }
  | { kind: "market"; center: number }
  | { kind: "location"; locationIdx: number };

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
  const selected = selection?.preset === "players" ? undefined : selection?.activeProfile;
  const viewed = useHistory.getState().viewedProfiles;
  const requested = [...(selected ? [selected] : []), ...viewed];
  const identities = requested.length ? await engine.trigger.getCampaignIdentities(requested) : [];
  let carried: Eu5Carry["selection"] = selection?.preset === "players" ? { kind: "players" } : null;
  if (selected) {
    const stable = identities.shift();
    if (stable?.kind === "country")
      carried = { ...stable, focusedLocation: selection?.focusedLocation ?? null };
    else if (stable) carried = stable;
  }
  const profiles: StableProfile[] = [];
  for (const stable of identities) {
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
  const profiles = await engine.trigger.restoreCampaignView(carry);
  // The camera comes last, so that nothing above moves it.
  if (carry.viewport !== null) await engine.trigger.fitWorldRect(carry.viewport);
  return profiles;
}
