import { describe, expect, it, vi } from "vitest";
import type { Eu5App, SelectionTargetData, UiCountryId } from "@/wasm/wasm_eu5";
import type { Eu5Carry } from "../../campaignCarry";
import { captureSelection, clickChange, restoreCampaignView } from "./restoreCampaignView";

const id = (value: number) => value as UiCountryId;
type Countries = ReturnType<Eu5App["get_countries"]>["countries"];
const country = (key: number, value: number, tag: string, landed = true) => ({
  id: id(value),
  landed,
  tag,
  country: { key, name: tag },
  capital: undefined,
});

const carry = (extra: Partial<Eu5Carry> = {}): Eu5Carry => ({
  mapMode: "population",
  viewport: null,
  insightPanel: { open: true, width: 640 },
  selection: null,
  ...extra,
});

/** A save with its own country keys and market ids. */
function save({
  target,
  focusedLocation,
  centers = new Map<number, number>(),
}: {
  target?: SelectionTargetData;
  focusedLocation?: number;
  centers?: Map<number, number>;
} = {}) {
  const change = () => ({ colorsChanged: false, flagsChanged: true, gradient: undefined });
  const marketAt = new Map([...centers].map(([market, center]) => [center, market]));
  return {
    set_map_mode: vi.fn((mapMode) => ({
      ...change(),
      mapMode,
      date: { year: 1, month: 1, day: 1 },
    })),
    select_players: vi.fn(change),
    change_selection: vi.fn(change),
    focus_in_selection: vi.fn(change),
    click: vi.fn(change),
    clear_focus_or_selection: vi.fn(change),
    selection_target: vi.fn(() => target),
    market_center_id: vi.fn((market: number) => centers.get(market)),
    market_at_center_id: vi.fn((center: number) => marketAt.get(center)),
    get_selection_summary: vi.fn(() => ({ focusedLocation })),
  };
}
type Save = ReturnType<typeof save>;
const asApp = (s: Save) => s as unknown as Eu5App;

/** Carry the selection of one save into the next, as a campaign step does. */
function step(from: Save, fromCountries: Countries, to: Save, toCountries: Countries) {
  const selection = captureSelection(asApp(from), fromCountries);
  restoreCampaignView(asApp(to), toCountries, carry({ selection }));
  return selection;
}

describe("a campaign step keeps the selection", () => {
  it("finds countries by id, then by tag, and drops a country that is gone", () => {
    const before = [country(5, 611, "YMT"), country(6, 612, "CAS"), country(7, 613, "POR")];
    // YMT took a new tag and CAS has other keys; POR is gone and another NTC has no land.
    const after = [country(1, 700, "NTC", false), country(2, 611, "NTC"), country(3, 612, "CAS")];
    const next = save();
    step(save({ target: { kind: "countries", ids: [5, 6, 7] } }), before, next, after);
    expect(next.change_selection).toHaveBeenCalledExactlyOnceWith(
      "replace",
      "countries",
      Uint32Array.from([2, 3]),
    );
  });

  it("finds markets by their center, and drops a market that is gone", () => {
    const next = save({ centers: new Map([[40, 100]]) });
    const before = save({
      target: { kind: "markets", ids: [3, 4] },
      centers: new Map([
        [3, 100],
        [4, 200],
      ]),
    });
    step(before, [], next, []);
    expect(next.change_selection).toHaveBeenCalledExactlyOnceWith(
      "replace",
      "markets",
      Uint32Array.from([40]),
    );
  });

  it("keeps the same land, the players, and focus only inside the new selection", () => {
    const land = save();
    step(save({ target: { kind: "locations", ids: [8, 9] }, focusedLocation: 9 }), [], land, []);
    expect(land.change_selection).toHaveBeenCalledExactlyOnceWith(
      "replace",
      "locations",
      Uint32Array.from([8, 9]),
    );
    expect(land.focus_in_selection).toHaveBeenCalledExactlyOnceWith(9);
    expect(land.change_selection.mock.invocationCallOrder[0]).toBeLessThan(
      land.focus_in_selection.mock.invocationCallOrder[0],
    );

    const players = save();
    step(save({ target: { kind: "players" } }), [], players, []);
    expect(players.select_players).toHaveBeenCalledOnce();
    expect(players.change_selection).not.toHaveBeenCalled();
  });

  it("carries nothing for an empty selection", () => {
    const next = save();
    expect(step(save(), [], next, [])).toBeNull();
    expect(next.change_selection).not.toHaveBeenCalled();
    expect(next.select_players).not.toHaveBeenCalled();
  });
});

describe("a click on the map", () => {
  it("adds with Shift, removes with Alt, and otherwise replaces", () => {
    const app = save();
    clickChange(asApp(app), { kind: "update", locationIdx: 4, modifiers: 1 });
    clickChange(asApp(app), { kind: "update", locationIdx: 4, modifiers: 4 });
    clickChange(asApp(app), { kind: "update", locationIdx: 4, modifiers: 0 });
    clickChange(asApp(app), { kind: "clear" });
    expect(app.click.mock.calls).toEqual([
      ["add", 4],
      ["remove", 4],
      ["replace", 4],
    ]);
    expect(app.clear_focus_or_selection).toHaveBeenCalledOnce();
  });

  it("from a snapshot applies after the carried selection", () => {
    const app = save();
    restoreCampaignView(
      asApp(app),
      [],
      carry({
        selection: { target: { kind: "players" }, focusedLocation: null },
        inspection: { click: { kind: "update", locationIdx: 42, modifiers: 1 } },
      }),
    );
    expect(app.click).toHaveBeenCalledExactlyOnceWith("add", 42);
    expect(app.select_players.mock.invocationCallOrder[0]).toBeLessThan(
      app.click.mock.invocationCallOrder[0],
    );
  });
});

it("combines the buffer changes of a restore", () => {
  const app = save();
  app.change_selection.mockReturnValue({
    colorsChanged: true,
    flagsChanged: false,
    gradient: undefined,
  });
  const selection = {
    target: { kind: "locations" as const, locations: [1] },
    focusedLocation: null,
  };
  const result = restoreCampaignView(asApp(app), [], carry({ selection }));
  expect(app.set_map_mode).toHaveBeenCalledWith("population");
  expect(result.change).toMatchObject({ colorsChanged: true, flagsChanged: true });
});
