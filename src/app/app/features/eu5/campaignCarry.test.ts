import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEngine } from "./ui-engine";
import type { Eu5Carry } from "./campaignCarry";
import { applyEu5Carry, captureEu5Carry } from "./campaignCarry";
import type { Eu5Store } from "./store/eu5Store";
import { useHistory } from "./history/store";
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
    replayMapInteraction: vi.fn().mockResolvedValue(undefined),
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
beforeEach(() => useHistory.getState().setViewedProfiles([]));
describe("campaign profile carry", () => {
  it("captures a market by its center and country breadcrumbs by tag", async () => {
    const previous = engine();
    useHistory
      .getState()
      .setViewedProfiles([{ kind: "country", country: { key: 12, name: "France" } }]);
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
    expect(result.profiles).toEqual([{ kind: "country", tag: "FRA" }]);
  });
  it("restores the view in one worker call before moving the camera", async () => {
    const next = engine();
    const view = carry({ selection: { kind: "country", tag: "FRA", focusedLocation: null } });
    const profiles = await applyEu5Carry(next as unknown as AppEngine, view);
    expect(next.trigger.restoreCampaignView).toHaveBeenCalledExactlyOnceWith(view);
    expect(profiles).toEqual([{ kind: "country", country: { key: 77, name: "France" } }]);
    expect(next.trigger.fitWorldRect).not.toHaveBeenCalled();
  });
  it("replays a carried map interaction after restoring the view", async () => {
    const next = engine();
    const interaction = {
      kind: "click" as const,
      event: { kind: "update" as const, locationIdx: 42, modifiers: 1 },
    };
    const order: string[] = [];
    next.trigger.restoreCampaignView.mockImplementation(async () => {
      order.push("restore");
      return [];
    });
    next.trigger.replayMapInteraction.mockImplementation(async () => {
      order.push("interaction");
    });
    next.trigger.fitWorldRect.mockImplementation(async () => {
      order.push("camera");
    });
    const view = carry({
      viewport: { x: 1, y: 2, width: 3, height: 4 },
      inspection: { interaction },
    });

    const profiles = await applyEu5Carry(next as unknown as AppEngine, view);

    expect(order).toEqual(["restore", "interaction", "camera"]);
    expect(next.trigger.replayMapInteraction).toHaveBeenCalledExactlyOnceWith(interaction);
    expect(profiles).toEqual([]);
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
