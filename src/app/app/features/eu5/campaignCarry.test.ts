import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEngine } from "./ui-engine";
import type { Eu5Carry } from "./campaignCarry";
import { applyEu5Carry, captureEu5Carry } from "./campaignCarry";
import type { Eu5Store } from "./store/eu5Store";
import { useHistory } from "./history/store";
const engine = () => ({
  state: { currentMapMode: "political" },
  trigger: {
    selectMapMode: vi.fn(),
    selectCountry: vi.fn(),
    selectMarket: vi.fn(),
    setFocusedLocation: vi.fn(),
    selectPlayers: vi.fn(),
    fitWorldRect: vi.fn(),
    getCountryProfile: vi.fn().mockResolvedValue({ header: { tag: "FRA" } }),
    getMarketProfile: vi.fn().mockResolvedValue({ centerId: 100, header: { name: "Paris" } }),
    getLocationProfile: vi.fn().mockResolvedValue({ header: { location: { name: "Paris" } } }),
    getMarketIdAtCenter: vi.fn().mockResolvedValue(91),
    searchEntities: vi
      .fn()
      .mockResolvedValue([{ kind: "country", id: 77, tag: "FRA", name: "France" }]),
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
  it("resolves changed country and market indices in the next save", async () => {
    const next = engine();
    const profiles = await applyEu5Carry(
      next as unknown as AppEngine,
      carry({
        selection: { kind: "market", center: 100 },
        profiles: [
          { kind: "country", tag: "FRA" },
          { kind: "market", center: 100 },
        ],
      }),
    );
    expect(next.trigger.selectMarket).toHaveBeenCalledWith(91);
    expect(next.trigger.selectMapMode).toHaveBeenCalledWith("population");
    expect(profiles).toEqual([
      { kind: "country", country: { key: 77, name: "France" } },
      { kind: "market", market: { key: 91, name: "Paris" } },
    ]);
  });
  it("drops descendants of a vanished breadcrumb instead of reusing old indices", async () => {
    const next = engine();
    next.trigger.searchEntities.mockResolvedValue([]);
    const profiles = await applyEu5Carry(
      next as unknown as AppEngine,
      carry({
        profiles: [
          { kind: "country", tag: "FRA" },
          { kind: "location", locationIdx: 100 },
        ],
      }),
    );
    expect(profiles).toEqual([]);
    expect(next.trigger.getLocationProfile).not.toHaveBeenCalled();
  });
  it("leaves a vanished market unselected", async () => {
    const next = engine();
    next.trigger.getMarketIdAtCenter.mockResolvedValue(undefined);
    await applyEu5Carry(
      next as unknown as AppEngine,
      carry({ selection: { kind: "market", center: 100 } }),
    );
    expect(next.trigger.selectMarket).not.toHaveBeenCalled();
  });
});
