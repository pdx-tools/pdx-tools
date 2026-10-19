import { describe, expect, it, vi } from "vitest";
import type { Eu5App, UiCountryId } from "@/wasm/wasm_eu5";
import type { Eu5Carry } from "../../campaignCarry";
import { campaignIdentities, restoreCampaignView } from "./restoreCampaignView";

const id = (value: number) => value as UiCountryId;

const carry = (extra: Partial<Eu5Carry> = {}): Eu5Carry => ({
  mapMode: "population",
  viewport: null,
  insightPanel: { open: true, width: 640 },
  selection: null,
  ...extra,
});
const countries = [
  { id: id(611), landed: true, tag: "FRA", country: { key: 77, name: "France" }, capital: 100 },
] as ReturnType<Eu5App["get_countries"]>["countries"];
function app() {
  const change = () => ({ colorsChanged: false, flagsChanged: true, gradient: undefined });
  return {
    set_map_mode: vi.fn((mapMode) => ({
      ...change(),
      mapMode,
      date: { year: 1400, month: 1, day: 1 },
    })),
    select_players: vi.fn(change),
    select_country: vi.fn(change),
    select_market: vi.fn(change),
    remove_country: vi.fn(change),
    remove_market: vi.fn(change),
    location_index_from_id: vi.fn((): number | undefined => 100),
    set_focused_location: vi.fn(change),
    market_id_at_center: vi.fn((): number | undefined => 91),
    get_market_profile: vi.fn(() => ({ centerId: 100, header: { name: "Paris" } })),
    get_location_profile: vi.fn(() => ({ header: { location: { key: 100, name: "Paris" } } })),
    get_selection_summary: vi.fn(() => ({ preset: null })),
    add_entity: vi.fn(change),
    remove_entity: vi.fn(change),
    select_entity: vi.fn(change),
    clear_focus_or_selection: vi.fn(change),
  };
}
const restore = (a: ReturnType<typeof app>, view: Eu5Carry) =>
  restoreCampaignView(a as unknown as Eu5App, countries, view);

describe("worker campaign view restoration", () => {
  it.each([false, true])("resolves a chart country by stable ID (remove: %s)", (remove) => {
    const a = app();
    restore(a, carry({ inspection: { entity: { kind: "country", id: 611 }, remove } }));
    expect(remove ? a.remove_country : a.select_country).toHaveBeenCalledExactlyOnceWith(77);
  });
  it.each([false, true])(
    "applies a chart market action to its original observation (remove: %s)",
    (remove) => {
      const a = app();
      restore(a, carry({ inspection: { entity: { kind: "market", id: 91 }, remove } }));
      expect(remove ? a.remove_market : a.select_market).toHaveBeenCalledExactlyOnceWith(91);
    },
  );
  it("resolves a chart location ID before opening its detail", () => {
    const a = app();
    restore(a, carry({ inspection: { entity: { kind: "location", id: 501 } } }));
    expect(a.location_index_from_id).toHaveBeenCalledExactlyOnceWith(501);
    expect(a.set_focused_location).toHaveBeenCalledExactlyOnceWith(100);
  });
  it("rejects absent chart entities", () => {
    const a = app();
    expect(() =>
      restore(a, carry({ inspection: { entity: { kind: "country", id: 999 } } })),
    ).toThrow("Country is absent");
    a.location_index_from_id.mockReturnValue(undefined);
    expect(() =>
      restore(a, carry({ inspection: { entity: { kind: "location", id: 999 } } })),
    ).toThrow("Location is absent");
  });
  it("remaps countries by exact tag and restores focus without location search", () => {
    const a = app();
    const result = restore(
      a,
      carry({
        selection: { kind: "country", tag: "FRA", focusedLocation: 100 },
        profiles: [
          { kind: "country", tag: "FRA" },
          { kind: "location", locationIdx: 100 },
        ],
      }),
    );
    expect(a.set_map_mode).toHaveBeenCalledWith("population");
    expect(a.select_country).toHaveBeenCalledWith(77);
    expect(a.set_focused_location).toHaveBeenCalledWith(100);
    expect(result.profiles).toEqual([
      { kind: "country", country: { key: 77, name: "France" } },
      { kind: "location", location: { key: 100, name: "Paris" } },
    ]);
    expect(a.get_selection_summary).toHaveBeenCalledTimes(1);
  });
  it("remaps market selections and breadcrumbs by center", () => {
    const a = app();
    const result = restore(
      a,
      carry({
        selection: { kind: "market", center: 100 },
        profiles: [{ kind: "market", center: 100 }],
      }),
    );
    expect(a.select_market).toHaveBeenCalledWith(91);
    expect(result.profiles).toEqual([{ kind: "market", market: { key: 91, name: "Paris" } }]);
  });
  it("drops descendants of vanished breadcrumbs and leaves missing selections empty", () => {
    const a = app();
    a.market_id_at_center.mockReturnValue(undefined);
    const result = restore(
      a,
      carry({
        selection: { kind: "market", center: 100 },
        profiles: [
          { kind: "country", tag: "GONE" },
          { kind: "location", locationIdx: 100 },
        ],
      }),
    );
    expect(result.profiles).toEqual([]);
    expect(a.select_market).not.toHaveBeenCalled();
    expect(a.get_location_profile).not.toHaveBeenCalled();
  });
  it("combines buffer changes and returns the final selection gradient", () => {
    const a = app();
    a.select_country.mockReturnValue({
      colorsChanged: true,
      flagsChanged: false,
      gradient: undefined,
    });
    const result = restore(
      a,
      carry({ selection: { kind: "country", tag: "FRA", focusedLocation: null } }),
    );
    expect(result.change).toMatchObject({
      colorsChanged: true,
      flagsChanged: true,
      gradient: undefined,
    });
  });
  it("restores player and location selections", () => {
    const a = app();
    restore(a, carry({ selection: { kind: "players" } }));
    restore(a, carry({ selection: { kind: "location", locationIdx: 100 } }));
    expect(a.select_players).toHaveBeenCalledTimes(1);
    expect(a.set_focused_location).toHaveBeenCalledWith(100);
  });
});

it("captures mixed profile identities using the country index", () => {
  const a = app();
  expect(
    campaignIdentities(a as unknown as Eu5App, countries, [
      { kind: "country", country: { key: 77, name: "France" } },
      { kind: "country", country: { key: 99, name: "Missing" } },
      { kind: "market", market: { key: 91, name: "Paris" } },
      { kind: "location", location: { key: 100, name: "Paris" } },
    ]),
  ).toEqual([
    { kind: "country", id: id(611), tag: "FRA" },
    null,
    { kind: "market", center: 100 },
    { kind: "location", locationIdx: 100 },
  ]);
});

it("keeps selections and breadcrumb profiles on the same country across a tag change", () => {
  const a = app();
  const countries = [
    {
      id: id(611),
      landed: true,
      tag: "YMT",
      country: { key: 5, name: "Yamato" },
      capital: undefined,
    },
    { id: id(700), landed: true, tag: "NTC", country: { key: 6, name: "New NTC" }, capital: 100 },
  ];
  const result = restoreCampaignView(
    a as unknown as Eu5App,
    countries,
    carry({
      selection: { kind: "country", id: id(611), tag: "NTC", focusedLocation: null },
      profiles: [{ kind: "country", id: id(611), tag: "NTC" }],
    }),
  );
  expect(a.select_country).toHaveBeenCalledWith(5);
  expect(result.profiles).toEqual([{ kind: "country", country: { key: 5, name: "Yamato" } }]);
  expect(campaignIdentities(a as unknown as Eu5App, countries, result.profiles)).toEqual([
    { kind: "country", id: id(611), tag: "YMT" },
  ]);
});

it("applies a carried click after the carried selection", () => {
  const a = app();
  restore(
    a,
    carry({
      selection: { kind: "players" },
      inspection: { click: { kind: "update", locationIdx: 42, modifiers: 1 } },
    }),
  );
  // Shift adds the clicked entity to the carried selection.
  expect(a.add_entity).toHaveBeenCalledExactlyOnceWith(42);
  expect(a.select_players.mock.invocationCallOrder[0]).toBeLessThan(
    a.add_entity.mock.invocationCallOrder[0],
  );
  expect(a.select_entity).not.toHaveBeenCalled();
});
