import { describe, expect, it, vi } from "vitest";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";
import type { Eu5Carry } from "./campaignCarry";
import { applyEu5Carry, captureEu5Carry } from "./campaignCarry";

const engine = () => ({
  state: { currentMapMode: "political" },
  queries: {
    getCountryTag: vi.fn().mockResolvedValue("FRA"),
    findCountryByTag: vi.fn().mockResolvedValue(77),
    getMarketProfile: vi.fn().mockResolvedValue({ centerId: 100 }),
    getMarketIdAtCenter: vi.fn().mockResolvedValue(91),
  },
  commands: {
    selectPlayers: vi.fn(),
    selectCountry: vi.fn(),
    selectMarket: vi.fn(),
    setFocusedLocation: vi.fn(),
  },
  trigger: { selectMapMode: vi.fn(), fitWorldRect: vi.fn() },
});
const view = (selection: Eu5Carry["selection"]): Eu5Carry => ({
  mapMode: "population",
  viewport: { x: 1, y: 2, width: 3, height: 4 },
  insightPanel: { open: true, width: 640 },
  selection,
});
const capture = (previous: ReturnType<typeof engine>, selectionState: unknown) =>
  captureEu5Carry({
    getState: () => ({
      engine: previous,
      appState: {
        currentMapMode: "population",
        selectionState,
        mapViewport: { viewport: view(null).viewport },
      },
      insightPanelOpen: true,
      insightPanelWidth: 640,
    }),
  } as unknown as Eu5Store);
const apply = (next: ReturnType<typeof engine>, selection: Eu5Carry["selection"]) =>
  applyEu5Carry(next as unknown as AppEngine, view(selection));

describe("campaign view carry", () => {
  it("preserves a market through its center when its ID changes in the next save", async () => {
    const previous = engine();
    const carry = await capture(previous, {
      activeProfile: { kind: "market", market: { key: 3, name: "Paris" } },
    });
    expect(carry).toEqual(view({ kind: "market", center: 100 }));
    expect(previous.queries.getMarketProfile).toHaveBeenCalledExactlyOnceWith(3);

    const next = engine();
    await applyEu5Carry(next as unknown as AppEngine, carry);
    expect(next.queries.getMarketIdAtCenter).toHaveBeenCalledExactlyOnceWith(100);
    expect(next.commands.selectMarket).toHaveBeenCalledExactlyOnceWith(91);
    expect(next.trigger.selectMapMode).toHaveBeenCalledExactlyOnceWith("population");
    expect(next.trigger.fitWorldRect).toHaveBeenCalledExactlyOnceWith(carry.viewport);
    expect(next.commands.selectMarket.mock.invocationCallOrder[0]).toBeLessThan(
      next.trigger.fitWorldRect.mock.invocationCallOrder[0],
    );
  });

  it("preserves a location profile independently of country selection", async () => {
    const previous = engine();
    const carry = await capture(previous, {
      activeProfile: { kind: "location", location: { key: 100, name: "Paris" } },
    });
    expect(carry.selection).toEqual({ kind: "location", locationIdx: 100 });
    expect(previous.queries.getMarketProfile).not.toHaveBeenCalled();
    expect(previous.queries.getCountryTag).not.toHaveBeenCalled();

    const next = engine();
    await applyEu5Carry(next as unknown as AppEngine, carry);
    expect(next.commands.setFocusedLocation).toHaveBeenCalledExactlyOnceWith(100);
    expect(next.commands.selectCountry).not.toHaveBeenCalled();
    expect(next.commands.setFocusedLocation.mock.invocationCallOrder[0]).toBeLessThan(
      next.trigger.fitWorldRect.mock.invocationCallOrder[0],
    );
  });

  it("leaves the selection empty when the carried market no longer has that center", async () => {
    const next = engine();
    next.queries.getMarketIdAtCenter.mockResolvedValue(null);
    await apply(next, { kind: "market", center: 100 });
    expect(next.commands.selectMarket).not.toHaveBeenCalled();
    expect(next.commands.setFocusedLocation).not.toHaveBeenCalled();
    expect(next.trigger.fitWorldRect).toHaveBeenCalledOnce();
  });

  it("accepts market ID zero", async () => {
    const next = engine();
    next.queries.getMarketIdAtCenter.mockResolvedValue(0);
    await apply(next, { kind: "market", center: 100 });
    expect(next.commands.selectMarket).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("does not carry a market that cannot be resolved in the original save", async () => {
    const previous = engine();
    previous.queries.getMarketProfile.mockResolvedValue(null);
    const carry = await capture(previous, {
      activeProfile: { kind: "market", market: { key: 3, name: "Paris" } },
    });
    expect(carry.selection).toBeNull();
  });

  it("keeps country remapping and its focused location", async () => {
    const previous = engine();
    const carry = await capture(previous, {
      activeProfile: { kind: "country", country: { key: 12, name: "France" } },
      focusedLocation: 100,
    });
    expect(carry.selection).toEqual({ kind: "country", tag: "FRA", focusedLocation: 100 });
    const next = engine();
    await applyEu5Carry(next as unknown as AppEngine, carry);
    expect(next.commands.selectCountry).toHaveBeenCalledExactlyOnceWith(77);
    expect(next.commands.setFocusedLocation).toHaveBeenCalledExactlyOnceWith(100);
  });

  it("keeps the players preset ahead of an active location profile", async () => {
    const previous = engine();
    const carry = await capture(previous, {
      preset: "players",
      activeProfile: { kind: "location", location: { key: 100, name: "Paris" } },
    });
    expect(carry.selection).toEqual({ kind: "players" });
    const next = engine();
    await applyEu5Carry(next as unknown as AppEngine, carry);
    expect(next.commands.selectPlayers).toHaveBeenCalledOnce();
    expect(next.commands.setFocusedLocation).not.toHaveBeenCalled();
  });
});
