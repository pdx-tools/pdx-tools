import { describe, expect, it } from "vitest";
import { resolveSearchSelection } from "./searchSelection";

describe("resolveSearchSelection", () => {
  it("selects a country by its country index and jumps to its capital", () => {
    expect(
      resolveSearchSelection({
        kind: "country",
        id: 42,
        name: "France",
        tag: "FRA",
        locationIdx: 1701,
      }),
    ).toEqual({ kind: "country", countryIdx: 42, jumpTo: 1701 });
  });

  it("focuses a location by its location index", () => {
    expect(
      resolveSearchSelection({ kind: "location", id: 1701, name: "Paris", locationIdx: 1701 }),
    ).toEqual({ kind: "location", locationIdx: 1701, jumpTo: 1701 });
  });
});
