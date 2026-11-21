import { create } from "zustand";
import type { ChartCountries } from "@/wasm/wasm_eu4";
import { NO_FOCUS } from "./history";
import type { Focus } from "./history";

/**
 * What the by-save charts keep for a campaign while saves open and close
 * and the reader moves between figures: the pinned countries, the selected
 * save, the subject and pins, and the zoom.
 */
export const useBySaveView = create<{
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
  /** Which countries are in color, in words, for the chip beside the filter. */
  colorRule: string | null;
}>()(() => ({
  pinned: null,
  selected: null,
  lastOpen: null,
  focus: null,
  zoom: null,
  colorRule: null,
}));

export function selectSave(campaignId: string, saveKey: string) {
  useBySaveView.setState({ selected: { campaignId, saveKey } });
}

export function useFocus(campaignId: string | null): Focus {
  return useBySaveView((state) =>
    state.focus && state.focus.campaignId === campaignId ? state.focus.focus : NO_FOCUS,
  );
}

export function setFocus(campaignId: string, focus: Focus) {
  useBySaveView.setState({ focus: { campaignId, focus } });
}

export function useZoom(campaignId: string | null) {
  return useBySaveView((state) =>
    state.zoom && state.zoom.campaignId === campaignId ? state.zoom : null,
  );
}

export function setZoom(campaignId: string, view: [number, number] | null, fitted: boolean) {
  useBySaveView.setState({ zoom: { campaignId, view, fitted } });
}
