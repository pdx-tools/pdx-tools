import { create } from "zustand";
import type { ChartCountries } from "@/wasm/wasm_eu4";
import { NO_FOCUS } from "./history";
import type { ColorMode, Focus } from "./history";

/**
 * What the Campaign sheet keeps for a campaign while saves open and close
 * and the reader moves between figures: the pinned countries, the selected
 * save, the subject and pins, and the zoom.
 */
export const useCampaignView = create<{
  /** The chart countries stay pinned until the filter or the campaign changes. */
  pinned: { campaignId: string; filter: string; countries: ChartCountries } | null;
  /** The key of the selected campaign save. */
  selected: { campaignId: string; saveKey: string } | null;
  /** The key of the open save when the chart last showed, to follow a step to another save. */
  lastOpen: { campaignId: string; saveKey: string } | null;
  /** The subject and pins, by lineage key. */
  focus: { campaignId: string; focus: Focus } | null;
  /** The days in view, or null for the whole campaign, and a scale fitted to them. */
  zoom: { campaignId: string; view: [number, number] | null; fitted: boolean } | null;
  /** What is drawn in front, in words, for the chip beside the filter. */
  colorRule: string | null;
  /** Each rule in the chip's words, for its menu. */
  colorLabels: Record<ColorMode, string>;
  /** Why the chip cannot switch to the rivals rule now, or null when it can. */
  rivalsBlocked: string | null;
  /** The color rule the reader chose, for Mana and for the other figures. */
  colorModes: Partial<Record<ColorGroup, ColorMode>>;
}>()(() => ({
  colorModes: {},
  rivalsBlocked: null,
  colorLabels: { top: "Top 5", rivals: "You and rivals" },
  pinned: null,
  selected: null,
  lastOpen: null,
  focus: null,
  zoom: null,
  colorRule: null,
}));

export function selectSave(campaignId: string, saveKey: string) {
  useCampaignView.setState({ selected: { campaignId, saveKey } });
}

/** Leave another branch: the chart draws the game's current path, at its newest save. */
export function showCurrentPath(campaignId: string) {
  useCampaignView.setState((state) =>
    state.selected?.campaignId === campaignId ? { selected: null } : state,
  );
}

export function useFocus(campaignId: string | null): Focus {
  return useCampaignView((state) =>
    state.focus && state.focus.campaignId === campaignId ? state.focus.focus : NO_FOCUS,
  );
}

export function setFocus(campaignId: string, focus: Focus) {
  useCampaignView.setState({ focus: { campaignId, focus } });
}

export function useZoom(campaignId: string | null) {
  return useCampaignView((state) =>
    state.zoom && state.zoom.campaignId === campaignId ? state.zoom : null,
  );
}

export function setZoom(campaignId: string, view: [number, number] | null, fitted: boolean) {
  useCampaignView.setState({ zoom: { campaignId, view, fitted } });
}

/** Mana's figures default to the subject and its rivals in color, the others to the top five. */
export type ColorGroup = "mana" | "line";

export function useColorMode(group: ColorGroup): ColorMode {
  return useCampaignView(
    (state) => state.colorModes[group] ?? (group === "mana" ? "rivals" : "top"),
  );
}

export function setColorMode(group: ColorGroup, mode: ColorMode) {
  useCampaignView.setState((state) => ({ colorModes: { ...state.colorModes, [group]: mode } }));
}
