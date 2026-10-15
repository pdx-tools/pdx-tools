import { describe, expect, it, vi } from "vitest";
import type { AppEngine } from "./ui-engine";
import type { Eu5Store } from "./store/eu5Store";
import type { Eu5Carry } from "./campaignCarry";
import type { SelectionSummaryData } from "@/wasm/wasm_eu5";
import { applyEu5Carry, captureEu5Carry } from "./campaignCarry";

const engine = () => ({
  state: { currentMapMode: "political" },
  queries: {
    getCountryTag: vi.fn().mockResolvedValue("FRA"),
    findCountryByTag: vi.fn().mockResolvedValue(77),
    getMarketProfile: vi.fn().mockResolvedValue({ header: { anchorLocationIdx: 100 } }),
  },
  commands: {
    selectPlayers: vi.fn(),
    selectCountry: vi.fn(),
    selectMarket: vi.fn(),
    selectMarketAt: vi.fn(),
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
const capture = (
  previous: ReturnType<typeof engine>,
  selectionState: Pick<SelectionSummaryData, "activeProfile" | "focusedLocation" | "preset"> | null,
) =>
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
  it("preserves a market through its anchor without carrying its save-specific ID", async () => {
    const previous = engine();
    const carry = await capture(previous, {
      activeProfile: { kind: "market", market: { key: 3, name: "Paris" } },
      focusedLocation: undefined,
      preset: undefined,
    });
    expect(carry).toEqual(view({ kind: "market", locationIdx: 100 }));
    expect(previous.queries.getMarketProfile).toHaveBeenCalledExactlyOnceWith(3);

    const next = engine();
    await applyEu5Carry(next as unknown as AppEngine, carry);
    expect(next.commands.selectMarketAt).toHaveBeenCalledExactlyOnceWith(100);
    expect(next.commands.selectMarket).not.toHaveBeenCalled();
    expect(next.trigger.selectMapMode).toHaveBeenCalledExactlyOnceWith("population");
    expect(next.trigger.fitWorldRect).toHaveBeenCalledExactlyOnceWith(carry.viewport);
    expect(next.commands.selectMarketAt.mock.invocationCallOrder[0]).toBeLessThan(
      next.trigger.fitWorldRect.mock.invocationCallOrder[0],
    );
  });

  it("preserves a location profile independently of country selection", async () => {
    const previous = engine();
    const carry = await capture(previous, {
      activeProfile: { kind: "location", location: { key: 100, name: "Paris" } },
      focusedLocation: 100,
      preset: undefined,
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

  it("accepts anchor location index zero", async () => {
    const previous = engine();
    previous.queries.getMarketProfile.mockResolvedValue({ header: { anchorLocationIdx: 0 } });
    const carry = await capture(previous, {
      activeProfile: { kind: "market", market: { key: 3, name: "Paris" } },
      focusedLocation: undefined,
      preset: undefined,
    });
    expect(carry.selection).toEqual({ kind: "market", locationIdx: 0 });
    const next = engine();
    await applyEu5Carry(next as unknown as AppEngine, carry);
    expect(next.commands.selectMarketAt).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("does not carry a market that cannot be resolved in the original save", async () => {
    const previous = engine();
    previous.queries.getMarketProfile.mockResolvedValue(null);
    const carry = await capture(previous, {
      activeProfile: { kind: "market", market: { key: 3, name: "Paris" } },
      focusedLocation: undefined,
      preset: undefined,
    });
    expect(carry.selection).toBeNull();
  });

  it("keeps country remapping without a focused location", async () => {
    const previous = engine();
    const carry = await capture(previous, {
      activeProfile: { kind: "country", country: { key: 12, name: "France" } },
      focusedLocation: undefined,
      preset: undefined,
    });
    expect(carry.selection).toEqual({ kind: "country", tag: "FRA" });
    const next = engine();
    await applyEu5Carry(next as unknown as AppEngine, carry);
    expect(next.commands.selectCountry).toHaveBeenCalledExactlyOnceWith(77);
    expect(next.commands.setFocusedLocation).not.toHaveBeenCalled();
  });

  it("leaves selection empty when the country is absent from the next save", async () => {
    const next = engine();
    next.queries.findCountryByTag.mockResolvedValue(null);
    await apply(next, { kind: "country", tag: "FRA" });
    expect(next.commands.selectCountry).not.toHaveBeenCalled();
    expect(next.commands.setFocusedLocation).not.toHaveBeenCalled();
    expect(next.trigger.fitWorldRect).toHaveBeenCalledOnce();
  });

  it("keeps the players preset ahead of an active location profile", async () => {
    const previous = engine();
    const carry = await capture(previous, {
      preset: "players",
      activeProfile: { kind: "location", location: { key: 100, name: "Paris" } },
      focusedLocation: 100,
    });
    expect(carry.selection).toEqual({ kind: "players" });
    const next = engine();
    await applyEu5Carry(next as unknown as AppEngine, carry);
    expect(next.commands.selectPlayers).toHaveBeenCalledOnce();
    expect(next.commands.setFocusedLocation).not.toHaveBeenCalled();
  });
});
