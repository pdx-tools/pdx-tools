import { describe, expect, it, vi } from "vitest";
import type { Eu5App } from "@/wasm/wasm_eu5";
import type { Eu5Carry } from "../../campaignCarry";
import { campaignIdentities, restoreCampaignView } from "./restoreCampaignView";

const carry = (extra: Partial<Eu5Carry> = {}): Eu5Carry => ({
  mapMode: "population",
  viewport: null,
  insightPanel: { open: true, width: 640 },
  selection: null,
  ...extra,
});
const countries = [
  { tag: "FRA", country: { key: 77, name: "France" }, capital: 100 },
] as ReturnType<Eu5App["get_countries"]>["countries"];
function app() {
  const change = () => ({ colorsChanged: false, flagsChanged: true, gradient: undefined });
  return {
    country_id_at_index: vi.fn(() => undefined),
    set_map_mode: vi.fn((mapMode) => ({
      ...change(),
      mapMode,
      date: { year: 1400, month: 1, day: 1 },
    })),
    select_players: vi.fn(change),
    select_country: vi.fn(change),
    select_market: vi.fn(change),
    set_focused_location: vi.fn(change),
    market_id_at_center: vi.fn((): number | undefined => 91),
    get_market_profile: vi.fn(() => ({ centerId: 100, header: { name: "Paris" } })),
    get_location_profile: vi.fn(() => ({ header: { location: { key: 100, name: "Paris" } } })),
    get_selection_summary: vi.fn(() => ({ preset: null })),
  };
}
const restore = (a: ReturnType<typeof app>, view: Eu5Carry) =>
  restoreCampaignView(a as unknown as Eu5App, countries, view);

describe("worker campaign view restoration", () => {
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
    { kind: "country", tag: "FRA" },
    null,
    { kind: "market", center: 100 },
    { kind: "location", locationIdx: 100 },
  ]);
});

it("keeps selections and breadcrumb profiles on the same country across a tag change", () => {
  const a = app();
  const countries = [
    { id: 611, tag: "YMT", country: { key: 5, name: "Yamato" }, capital: undefined },
    { id: 700, tag: "NTC", country: { key: 6, name: "New NTC" }, capital: 100 },
  ];
  const result = restoreCampaignView(
    a as unknown as Eu5App,
    countries,
    carry({
      selection: { kind: "country", id: 611, tag: "NTC", focusedLocation: null },
      profiles: [{ kind: "country", id: 611, tag: "NTC" }],
    }),
  );
  expect(a.select_country).toHaveBeenCalledWith(5);
  expect(result.profiles).toEqual([{ kind: "country", country: { key: 5, name: "Yamato" } }]);
  expect(campaignIdentities(a as unknown as Eu5App, countries, result.profiles)).toEqual([
    { kind: "country", id: 611, tag: "YMT" },
  ]);
});
