import { describe, expect, it } from "vitest";
import {
  applyFloor,
  bestRank,
  bestIsTied,
  captionHeading,
  compareColumns,
  compareBars,
  compareFinding,
  profileFinding,
  displayTag,
  percentileOf,
  isCountrySet,
  selectedLineCount,
  selectionName,
  selectionScalesLegend,
  topShareFinding,
} from "./selection";
import type { SelectionLike } from "./selection";

const base = { isEmpty: false, activeProfile: undefined, entityCount: 1, locationCount: 10 };
const france = {
  ...base,
  activeProfile: { kind: "country" as const, country: { key: 42, name: "France" } },
  scopeDisplayName: "France",
};

describe("selection", () => {
  it("knows a set of countries", () => {
    expect(isCountrySet(null)).toBe(false);
    expect(isCountrySet({ ...base, isEmpty: true, entityCount: 3 })).toBe(false);
    expect(isCountrySet(france)).toBe(false);
    expect(isCountrySet({ ...base, entityCount: 4 })).toBe(true);
    expect(isCountrySet({ ...base, preset: "players" })).toBe(true);
    // Land of one owner is not a set.
    expect(isCountrySet({ ...base, entityCount: 1 })).toBe(false);
  });

  it("hides a generated tag and keeps a real one", () => {
    expect(displayTag("FRA")).toBe("FRA");
    expect(displayTag("AAA67")).toBeUndefined();
    expect(displayTag(undefined)).toBeUndefined();
  });

  it("states a tie for the best rank only", () => {
    expect(bestIsTied([1, 1, 1, 577])).toBe(true);
    expect(bestIsTied([1, 2, 2])).toBe(false);
    expect(bestIsTied([1])).toBe(false);
    expect(bestIsTied([undefined, undefined])).toBe(false);
  });

  it("gives the first rank a full bar and the last an empty bar", () => {
    expect(percentileOf(1, 646)).toBe(1);
    expect(percentileOf(646, 646)).toBe(0);
    expect(percentileOf(1, 1)).toBe(1);
  });

  it("names the selection", () => {
    expect(selectionName(france)).toBe("France");
    expect(selectionName({ ...base, preset: "players", entityCount: 3 })).toBe("Players");
    expect(selectionName({ ...base, entityCount: 4 })).toBe("4 countries");
    expect(selectionName({ ...base, entityCount: 0 })).toBe("Unowned land");
  });

  it("counts land on the Selected line only when no entity heads the level", () => {
    expect(selectedLineCount({ ...france, locationCount: 545 })).toBeNull();
    expect(selectedLineCount({ ...base, entityCount: 4, locationCount: 545 })).toBe(
      "545 locations",
    );
    expect(selectedLineCount({ ...base, locationCount: 1 })).toBe("1 location");
    expect(selectedLineCount({ ...france, preset: "players", locationCount: 12 })).toBe(
      "12 locations",
    );
    expect(selectedLineCount({ ...france, locationCount: 0 })).toBe("No land on this date");
  });

  it("knows which legends the selection rescales", () => {
    expect(selectionScalesLegend("development")).toBe(true);
    expect(selectionScalesLegend("religion")).toBe(false);
    expect(selectionScalesLegend("control")).toBe(false);
  });
});

describe("rankings", () => {
  it("keeps a ratio ranking to countries of a size, and always the kept ones", () => {
    const rows = [
      { name: "big", locationCount: 40 },
      { name: "tiny", locationCount: 1 },
      { name: "player", locationCount: 2 },
    ];
    expect(
      applyFloor(
        rows,
        (r) => r.locationCount,
        (r) => r.name === "player",
      ).map((r) => r.name),
    ).toEqual(["big", "player"]);
  });
});

describe("compare", () => {
  it("takes the selected countries in the order of the mode, at most the cap", () => {
    expect(compareColumns([1, 2, 3], [9, 3, 1, 8])).toEqual([3, 1, 2]);
    expect(compareColumns([1, 2, 3, 4], [4, 3, 2, 1], 2)).toEqual([4, 3]);
  });

  it("gives a best rank only to one country", () => {
    expect(bestRank([3, 1, 2])).toBe(1);
    expect(bestRank([1, 1, 2])).toBeUndefined();
    expect(bestRank([1])).toBeUndefined();
    expect(bestRank([undefined, 4, undefined])).toBe(4);
    expect(bestRank([undefined, undefined])).toBeUndefined();
  });
});

describe("captionHeading", () => {
  const empty: SelectionLike = {
    isEmpty: true,
    activeProfile: undefined,
    entityCount: 0,
    locationCount: 0,
  };
  const country: SelectionLike = {
    isEmpty: false,
    activeProfile: { kind: "country", country: { key: 1, name: "France" } },
    entityCount: 1,
    locationCount: 545,
  };
  const set: SelectionLike = {
    isEmpty: false,
    activeProfile: undefined,
    entityCount: 4,
    locationCount: 900,
  };

  it("names the world's rows, and the mode stays with the map select", () => {
    expect(captionHeading("development", empty)).toBe("Countries by development");
    expect(captionHeading("political", null)).toBe("Great powers");
    expect(captionHeading("political", null, true)).toBe("Great powers and players");
  });

  it("names the rows of one entity", () => {
    expect(captionHeading("development", country)).toBe("France's locations");
    expect(captionHeading("religion", country)).toBe("France's religions");
    expect(
      captionHeading("religion", {
        ...country,
        activeProfile: { kind: "location", location: { key: 2, name: "Paris" } },
      }),
    ).toBe("Paris' religion");
    expect(
      captionHeading("markets", {
        ...country,
        activeProfile: { kind: "market", market: { key: 3, name: "Cologne Market" } },
      }),
    ).toBe("Cologne Market's goods");
  });

  it("keeps the order for a set", () => {
    expect(captionHeading("development", set)).toBe("4 countries by development");
    expect(captionHeading("political", set)).toBe("4 countries by rank");
  });
});

describe("compareFinding", () => {
  it("names the country with the most best ranks", () => {
    const ranks = [
      [1, 2],
      [1, 5],
      [9, 3],
    ];
    expect(compareFinding(["Rome", "France"], ranks)).toBe("Rome leads 2 of 3 ranked metrics");
  });

  it("does not count a tie, and it names equal leaders", () => {
    const ranks = [
      [1, 1],
      [1, 2],
      [3, 2],
    ];
    expect(compareFinding(["Rome", "France"], ranks)).toBe(
      "Rome and France each lead 1 of 3 ranked metrics",
    );
  });

  it("gives no line without a leader", () => {
    expect(compareFinding(["Rome", "France"], [[1, 1]])).toBeNull();
  });
});

describe("topShareFinding", () => {
  it("states the share of the top tenth", () => {
    const values = [50, 10, 10, 10, 5, 5, 5, 5, 0, 0];
    expect(topShareFinding("locations", "development", values)).toBe(
      "Top 10% of locations hold 50% of development",
    );
  });

  it("gives no line for a short list or an empty total", () => {
    expect(topShareFinding("locations", "development", [1, 2, 3])).toBeNull();
    expect(topShareFinding("locations", "development", Array(12).fill(0))).toBeNull();
  });
});

describe("profileFinding", () => {
  it("says how many ranks are near the top and names the lowest", () => {
    expect(
      profileFinding("France", [
        { label: "Income", rank: 3 },
        { label: "Wealth", rank: 2 },
        { label: "Stability", rank: 487 },
        { label: "Expense", rank: undefined },
      ]),
    ).toBe("France is in the top 10 on 2 of 3 ranked metrics, and lowest on Stability (#487)");
  });

  it("stays true for a country with no rank near the top", () => {
    expect(
      profileFinding("Bafra", [
        { label: "Income", rank: 300 },
        { label: "Wealth", rank: 412 },
      ]),
    ).toBe("Bafra is outside the top 10 on each ranked metric, and lowest on Wealth (#412)");
  });

  it("needs two ranks", () => {
    expect(profileFinding("France", [{ label: "Income", rank: 3 }])).toBeNull();
  });
});

describe("compareBars", () => {
  it("starts at the track's start when no value is under zero", () => {
    const { zero, bars } = compareBars([50, 100]);
    expect(zero).toBe(0);
    expect(bars).toEqual([
      { left: 0, width: 0.5 },
      { left: 0, width: 1 },
    ]);
  });

  it("puts a value under zero to the left of the zero line", () => {
    const { zero, bars } = compareBars([-25, 75]);
    expect(zero).toBe(0.25);
    expect(bars[0]).toEqual({ left: 0, width: 0.25 });
    expect(bars[1]).toEqual({ left: 0.25, width: 0.75 });
  });

  it("has no length with no values above or under zero", () => {
    expect(compareBars([0, 0]).bars[0].width).toBe(0);
  });
});
