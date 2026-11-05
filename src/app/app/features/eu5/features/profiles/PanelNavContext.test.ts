import { describe, expect, it } from "vitest";
import {
  backFrom,
  compareEntry,
  countryProfileEntry,
  crumbsAbove,
  entryKey,
  isColumnEscape,
  locationProfileEntry,
  marketProfileEntry,
  nextPath,
  openOnPath,
  sectionEntry,
  selectionCrumb,
  selectionIdentity,
} from "./PanelNavContext";

const france = countryProfileEntry(42, "France");
const paris = locationProfileEntry(99, "Paris");
const champagne = marketProfileEntry(7, "Champagne");
const franceLocations = sectionEntry(
  { kind: "country", country: { key: 42, name: "France" } },
  "locations",
  "Locations",
);

describe("column path", () => {
  it("builds typed profile entries", () => {
    expect(france).toEqual({
      kind: "profile",
      profile: { kind: "country", country: { key: 42, name: "France" } },
      label: "France",
    });
    expect(paris).toEqual({
      kind: "focus",
      profile: { kind: "location", location: { key: 99, name: "Paris" } },
      label: "Paris",
    });
  });

  it("keys a section under its profile", () => {
    expect(entryKey(france)).toBe("country:42");
    expect(entryKey(franceLocations)).toBe("country:42/locations");
    expect(entryKey({ kind: "insight", label: "Wealth" })).toBe("insight");
  });

  it("adds a new level on top", () => {
    expect(openOnPath([france], franceLocations)).toEqual([france, franceLocations]);
  });

  it("never repeats an entity: opening one in the path goes back to it", () => {
    const path = [france, franceLocations, paris, champagne];
    expect(openOnPath(path, franceLocations)).toEqual([france, franceLocations]);
    expect(openOnPath(path, countryProfileEntry(42, "France"))).toEqual([france]);
  });

  it("steps back one level, and stops at the caption", () => {
    expect(backFrom([france, franceLocations, paris])).toEqual([france, franceLocations]);
    expect(backFrom([france])).toEqual([]);
    // At the caption, Esc goes on to the map, which clears the selection.
    expect(backFrom([])).toBeNull();
  });

  it("opens a profile from the caption as the first level", () => {
    expect(openOnPath([], france)).toEqual([france]);
    expect(openOnPath([], paris)).toEqual([paris]);
  });

  it("names a selection apart from the revision that reports it", () => {
    const rome = {
      isEmpty: false,
      preset: undefined,
      activeProfile: { kind: "country" as const, country: { key: 42, name: "France" } },
      entityCount: 1,
      locationCount: 120,
    };
    expect(selectionIdentity(null)).toBe("none");
    expect(selectionIdentity({ ...rome, isEmpty: true })).toBe("none");
    expect(selectionIdentity(rome)).toBe(selectionIdentity({ ...rome }));
    expect(selectionIdentity(rome)).not.toBe(selectionIdentity({ ...rome, locationCount: 121 }));
    expect(selectionIdentity(rome)).not.toBe(selectionIdentity({ ...rome, preset: "players" }));
  });
});

describe("path after a change", () => {
  const details = { kind: "insight" as const, label: "Details" };
  const none = { isEmpty: true, activeProfile: undefined, entityCount: 0, locationCount: 0 };
  const one = (key: number) => ({
    isEmpty: false,
    activeProfile: { kind: "country" as const, country: { key, name: "France" } },
    entityCount: 1,
    locationCount: 120,
  });
  const set = { isEmpty: false, activeProfile: undefined, entityCount: 4, locationCount: 900 };
  const change = (extra: Partial<Parameters<typeof nextPath>[1]>) => ({
    modeChanged: false,
    selectionChanged: false,
    selection: none,
    pending: null,
    ...extra,
  });

  it("keeps profiles, sections and Compare on a mode switch, and closes the insight", () => {
    const modeChanged = true;
    expect(nextPath([france, franceLocations], change({ modeChanged }))).toEqual([
      france,
      franceLocations,
    ]);
    expect(nextPath([compareEntry, france], change({ modeChanged }))).toEqual([
      compareEntry,
      france,
    ]);
    expect(nextPath([details], change({ modeChanged }))).toEqual([]);
    expect(nextPath([france, details], change({ modeChanged }))).toEqual([france]);
  });

  it("starts a new path for a new selection", () => {
    expect(
      nextPath([france, paris], change({ selectionChanged: true, selection: one(7) })),
    ).toEqual([]);
  });

  it("keeps the level that a select-and-open asked for when its selection arrives", () => {
    const pending = france;
    expect(
      nextPath([france], change({ selectionChanged: true, selection: one(42), pending })),
    ).toEqual([france]);
    // Another selection came first: the path starts again.
    expect(
      nextPath([france], change({ selectionChanged: true, selection: one(7), pending })),
    ).toEqual([]);
  });

  it("opens Compare for a few chosen countries, and not for a preset, a scope, or a list in the making", () => {
    const few = { ...set, entityCount: 3 };
    expect(nextPath([], change({ selectionChanged: true, selection: few }))).toEqual([
      compareEntry,
    ]);
    expect(
      nextPath([], change({ selectionChanged: true, selection: { ...few, preset: "players" } })),
    ).toEqual([]);
    expect(
      nextPath([], change({ selectionChanged: true, selection: { ...few, entityCount: 40 } })),
    ).toEqual([]);
    expect(
      nextPath([], change({ selectionChanged: true, selection: few, keepList: true })),
    ).toEqual([]);
  });

  it("keeps Compare while the selection is still a set of countries", () => {
    expect(
      nextPath([compareEntry, france], change({ selectionChanged: true, selection: set })),
    ).toEqual([compareEntry]);
    expect(
      nextPath([compareEntry], change({ selectionChanged: true, selection: one(42) })),
    ).toEqual([]);
    expect(nextPath([compareEntry], change({ selectionChanged: true, selection: none }))).toEqual(
      [],
    );
  });
});

describe("column escape", () => {
  const key = (overrides: Partial<Parameters<typeof isColumnEscape>[0]> = {}) => ({
    key: "Escape",
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: { tagName: "BODY" },
    ...overrides,
  });

  it("takes a plain Esc on the page", () => {
    expect(isColumnEscape(key())).toBe(true);
    expect(isColumnEscape(key({ target: { tagName: "BUTTON" } }))).toBe(true);
  });

  it("leaves Esc to a menu, a dialog or the search that used it", () => {
    expect(isColumnEscape(key({ defaultPrevented: true }))).toBe(false);
  });

  it("leaves Esc to a text field", () => {
    expect(isColumnEscape(key({ target: { tagName: "INPUT" } }))).toBe(false);
    expect(isColumnEscape(key({ target: { tagName: "TEXTAREA" } }))).toBe(false);
    expect(isColumnEscape(key({ target: { tagName: "SELECT" } }))).toBe(false);
    expect(isColumnEscape(key({ target: { tagName: "DIV", isContentEditable: true } }))).toBe(
      false,
    );
  });

  it("ignores other keys and Esc with a modifier", () => {
    expect(isColumnEscape(key({ key: "Backspace" }))).toBe(false);
    expect(isColumnEscape(key({ shiftKey: true }))).toBe(false);
  });
});

describe("crumbs", () => {
  const buildings = sectionEntry(
    { kind: "location", location: { key: 99, name: "Paris" } },
    "buildings",
    "Buildings",
  );

  it("names the location of a part that opens from the caption", () => {
    expect(crumbsAbove([buildings])).toEqual([{ key: "location:99", label: "Paris", keep: 0 }]);
  });

  it("does not repeat an entity that has its own level", () => {
    expect(crumbsAbove([paris, buildings]).map((x) => x.label)).toEqual(["Paris"]);
    expect(crumbsAbove([france, franceLocations]).map((x) => x.label)).toEqual(["France"]);
  });

  it("puts the selection between the mode and the levels", () => {
    const details = { kind: "insight" as const, label: "Details" };
    const set = { isEmpty: false, activeProfile: undefined, entityCount: 4, locationCount: 9 };
    const country = {
      ...set,
      entityCount: 1,
      activeProfile: { kind: "country" as const, country: { key: 42, name: "France" } },
    };
    expect(selectionCrumb(null)).toBeNull();
    expect(crumbsAbove([compareEntry], selectionCrumb(set))).toEqual([
      { key: "selection", label: "4 countries", keep: 0 },
    ]);
    expect(crumbsAbove([details], selectionCrumb(country))).toEqual([
      { key: "country:42", label: "France", keep: 0 },
    ]);
    expect(crumbsAbove([paris], selectionCrumb(country)).map((x) => x.label)).toEqual(["France"]);
    // The entity's own level already names it.
    expect(crumbsAbove([france], selectionCrumb(country))).toEqual([]);
    expect(crumbsAbove([france, franceLocations], selectionCrumb(country))).toEqual([
      { key: "country:42", label: "France", keep: 1 },
    ]);
  });

  it("gives the name of the button to the insight", () => {
    const details = { kind: "insight" as const, label: "Control" };
    expect(crumbsAbove([details, france])).toEqual([{ key: "insight", label: "Details", keep: 1 }]);
  });
});
