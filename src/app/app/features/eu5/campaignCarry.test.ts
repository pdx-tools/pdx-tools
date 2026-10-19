import { describe, expect, it, vi } from "vitest";
import type { AppEngine } from "./ui-engine";
import type { Eu5Carry } from "./campaignCarry";
import { applyEu5Carry, captureEu5Carry } from "./campaignCarry";
import type { Eu5Store } from "./store/eu5Store";
const engine = () => ({
  state: { currentMapMode: "political" },
  trigger: {
    getCampaignIdentities: vi.fn().mockResolvedValue([
      { kind: "market", center: 100 },
      { kind: "country", tag: "FRA" },
    ]),
    restoreCampaignView: vi
      .fn()
      .mockResolvedValue([{ kind: "country", country: { key: 77, name: "France" } }]),
    fitWorldRect: vi.fn(),
  },
});
const carry = (extra: Partial<Eu5Carry> = {}): Eu5Carry => ({
  mapMode: "population",
  viewport: null,
  insightPanel: { open: true, width: 640 },
  selection: null,
  ...extra,
});
describe("campaign profile carry", () => {
  it("captures the selected market by its center", async () => {
    const previous = engine();
    const store = {
      getState: () => ({
        engine: previous,
        appState: {
          currentMapMode: "markets",
          selectionState: { activeProfile: { kind: "market", market: { key: 3, name: "Paris" } } },
        },
        insightPanelOpen: true,
        insightPanelWidth: 640,
      }),
    } as unknown as Eu5Store;
    const result = await captureEu5Carry(store);
    expect(result.selection).toEqual({ kind: "market", center: 100 });
  });
  it("restores the view in one worker call before moving the camera", async () => {
    const next = engine();
    const view = carry({ selection: { kind: "country", tag: "FRA", focusedLocation: null } });
    const profiles = await applyEu5Carry(next as unknown as AppEngine, view);
    expect(next.trigger.restoreCampaignView).toHaveBeenCalledExactlyOnceWith(view);
    expect(profiles).toBeUndefined();
    expect(next.trigger.fitWorldRect).not.toHaveBeenCalled();
  });
  it("captures a country and its focused location with one identity lookup", async () => {
    const previous = engine();
    previous.trigger.getCampaignIdentities.mockResolvedValue([{ kind: "country", tag: "FRA" }]);
    const profile = { kind: "country", country: { key: 77, name: "France" } };
    const store = {
      getState: () => ({
        engine: previous,
        appState: {
          currentMapMode: "development",
          selectionState: { activeProfile: profile, focusedLocation: 100 },
        },
        insightPanelOpen: true,
        insightPanelWidth: 640,
      }),
    } as unknown as Eu5Store;
    expect((await captureEu5Carry(store)).selection).toEqual({
      kind: "country",
      tag: "FRA",
      focusedLocation: 100,
    });
    expect(previous.trigger.getCampaignIdentities).toHaveBeenCalledExactlyOnceWith([profile]);
  });
  it("does not query identities for an unselected world view", async () => {
    const previous = engine();
    const store = {
      getState: () => ({
        engine: previous,
        appState: { currentMapMode: "development", selectionState: null },
        insightPanelOpen: true,
        insightPanelWidth: 640,
      }),
    } as unknown as Eu5Store;
    expect((await captureEu5Carry(store)).selection).toBeNull();
    expect(previous.trigger.getCampaignIdentities).not.toHaveBeenCalled();
  });
});
