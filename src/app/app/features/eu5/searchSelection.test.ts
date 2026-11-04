import { describe, expect, it } from "vitest";
import { rankSearchResults, resolveSearchSelection } from "./searchSelection";

describe("resolveSearchSelection", () => {
  it("selects a country by its country index and pans to its capital", () => {
    expect(
      resolveSearchSelection({
        kind: "country",
        id: 42,
        name: "France",
        tag: "FRA",
        colorHex: "#0000ff",
        locationIdx: 1701,
      }),
    ).toEqual({ kind: "country", countryIdx: 42, panTo: 1701 });
  });

  it("focuses a location by its location index", () => {
    expect(
      resolveSearchSelection({
        kind: "location",
        id: 1701,
        name: "Paris",
        ownerTag: "FRA",
        locationIdx: 1701,
      }),
    ).toEqual({ kind: "location", locationIdx: 1701, panTo: 1701 });
  });
});

describe("rankSearchResults", () => {
  it("ranks an exact tag, then a name prefix, then a substring", () => {
    const results = [
      { name: "Afrasiyab" },
      { name: "Frankfurt" },
      { name: "Fra Mauro" },
      { name: "France", tag: "FRA" },
    ];
    expect(rankSearchResults("fra", results).map((x) => x.name)).toEqual([
      "France",
      "Fra Mauro",
      "Frankfurt",
      "Afrasiyab",
    ]);
  });
});
