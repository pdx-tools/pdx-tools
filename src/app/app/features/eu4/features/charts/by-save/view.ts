import { create } from "zustand";
import type { ChartCountries } from "@/wasm/wasm_eu4";

/**
 * What the by-save charts keep for a campaign while saves open and close:
 * the pinned countries and the selected save.
 */
export const useBySaveView = create<{
  /** The chart countries stay pinned until the filter or the campaign changes. */
  pinned: { campaignId: string; filter: string; countries: ChartCountries } | null;
  /** The key of the selected campaign save. */
  selected: { campaignId: string; saveKey: string } | null;
}>()(() => ({ pinned: null, selected: null }));

export function selectSave(campaignId: string, saveKey: string) {
  useBySaveView.setState({ selected: { campaignId, saveKey } });
}
