import { describe, expect, it } from "vitest";
import {
  applyFloor,
  bestRank,
  bestIsTied,
  captionHeading,
  compareColumns,
  compareBars,
  standingsFinding,
  columnPlaces,
  countOf,
  currentJump,
  distinctInColumn,
  formatScore,
  leaderDrivers,
  lensFinding,
  namedShareFinding,
  locationFinding,
  figureTitle,
  landChapters,
  peerFinding,
  profileFinding,
  displayTag,
  campaignName,
  rankLabel,
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
    expect(displayTag("SAR_p")).toBeUndefined();
    expect(displayTag("ABGKH")).toBeUndefined();
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
    ).toBe("Paris");
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

describe("standingsFinding", () => {
  const entry = (name: string, value: number) => ({ name, value, shown: `${value}` });

  it("says who leads and by how much", () => {
    expect(standingsFinding("score", [entry("Rome", 40), entry("France", 93)])).toBe(
      "France leads on score with 93, ahead of Rome with 40.",
    );
  });

  it("says a tie as a tie", () => {
    expect(standingsFinding("score", [entry("Rome", 40), entry("France", 40)])).toBe(
      "Rome and France share the lead on score, with 40.",
    );
  });

  it("names a country at both ends of two metrics", () => {
    const three = (a: number, b: number, c: number) => [
      entry("Rome", a),
      entry("France", b),
      entry("England", c),
    ];
    expect(
      standingsFinding("score", three(1, 3, 2), [
        { label: "Income", entries: three(1, 2, 3) },
        { label: "Gold after loans", entries: three(3, 2, 1) },
      ]),
    ).toBe(
      "France leads on score with 3, ahead of England with 2. England has the top Income and the lowest Gold after loans.",
    );
  });

  it("gives no line for one country", () => {
    expect(standingsFinding("score", [entry("Rome", 40)])).toBeNull();
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
  it("says how many ranks are near the top and names the weakest, out of how many", () => {
    expect(
      profileFinding(
        "France",
        [
          { label: "Income", rank: 3 },
          { label: "Wealth", rank: 2 },
          { label: "Stability", rank: 487 },
          { label: "Expense", rank: undefined },
        ],
        577,
      ),
    ).toBe("France is top 10 on 2 of 3 metrics. Weakest: Stability, #487 of 577.");
  });

  it("says when a rank that a mass of countries shares is left out of the top", () => {
    expect(
      profileFinding(
        "Milan",
        [
          { label: "Gov. Power", rank: 1, tied: 461 },
          { label: "Income", rank: 11, tied: 1 },
          { label: "Prestige", rank: 8, tied: 1 },
        ],
        577,
      ),
    ).toBe(
      "Milan is top 10 on 1 of 3 metrics, not counting Gov. Power, where hundreds tie. Weakest: Income, #11 of 577.",
    );
  });

  it("stays true for a country with no rank near the top", () => {
    expect(
      profileFinding(
        "Bafra",
        [
          { label: "Income", rank: 300 },
          { label: "Wealth", rank: 412 },
        ],
        577,
      ),
    ).toBe("Bafra is outside the top 10 on each metric. Weakest: Wealth, #412 of 577.");
  });

  it("gives no denominator to a rank past the cohort", () => {
    expect(
      profileFinding(
        "Bafra",
        [
          { label: "Income", rank: 300 },
          { label: "Score", rank: 900 },
        ],
        577,
      ),
    ).toBe("Bafra is outside the top 10 on each metric. Weakest: Score, #900.");
  });

  it("needs two ranks", () => {
    expect(profileFinding("France", [{ label: "Income", rank: 3 }], 577)).toBeNull();
  });
});

describe("rankLabel", () => {
  it("marks a shared rank", () => {
    expect(rankLabel(1, 461)).toBe("=#1");
    expect(rankLabel(5)).toBe("#5");
    expect(rankLabel(5, 1)).toBe("#5");
  });
});

describe("campaignName", () => {
  it("removes the hash that the game adds to a default name", () => {
    expect(campaignName("Serbia #166b3650")).toBe("Serbia");
    expect(campaignName("Bohemia's Ironman #eaaf355b")).toBe("Bohemia's Ironman");
    expect(campaignName("REHOST2")).toBe("REHOST2");
    expect(campaignName("Serbia #1")).toBe("Serbia #1");
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

describe("landChapters", () => {
  const points = [
    { year: 1337, locations: 29 },
    { year: 1400, locations: 80 },
    { year: 1500, locations: 151 },
    { year: 1617, locations: 142 },
  ];

  it("tells the start, the largest moves, the peak and the end, in order", () => {
    expect(
      landChapters({
        points,
        peak: points[2],
        biggestGain: { year: 1400, change: 51 },
        biggestLoss: { year: 1617, change: -9 },
      }),
    ).toEqual([
      { year: 1337, text: "Holds 29 locations." },
      { year: 1400, text: "Largest gain: +51 locations." },
      { year: 1500, text: "Peak: 151 locations." },
      { year: 1617, text: "Largest loss: \u22129 locations. Now 142 locations." },
    ]);
  });

  it("gives no chapters to a country that never held land", () => {
    expect(landChapters({ points: [{ year: 1337, locations: 0 }], peak: points[0] })).toEqual([]);
  });
});

describe("peerFinding", () => {
  it("names first and last places", () => {
    expect(
      peerFinding(24, [
        { label: "Income", place: 1 },
        { label: "Gold after loans", place: 24 },
        { label: "Score", place: 5 },
      ]),
    ).toBe("Among the 24 players: #1 on Income, last on Gold after loans.");
  });

  it("gives the best place when the country leads nothing", () => {
    expect(
      peerFinding(24, [
        { label: "Income", place: 7 },
        { label: "Score", place: 5 },
      ]),
    ).toBe("Among the 24 players: best: #5 on Score.");
  });

  it("needs a group", () => {
    expect(peerFinding(2, [{ label: "Income", place: 1 }])).toBeNull();
  });
});

describe("figureTitle", () => {
  it("names the leader of the world", () => {
    expect(
      figureTitle({ leader: { name: "France", shown: "93", metric: "score" } }, "Political"),
    ).toBe("France leads the world on score, 93");
  });

  it("gives a selected country its rank, with the denominator", () => {
    expect(
      figureTitle(
        {
          entity: { kind: "country", name: "Milan" },
          entityRank: { rank: 18, of: 577, label: "Population" },
        },
        "Population",
      ),
    ).toBe("Milan: #18 of 577 on Population");
  });

  it("is true of a past date, also for a country with no land", () => {
    const entity = { kind: "country" as const, name: "Milan" };
    expect(
      figureTitle(
        {
          pastDate: "1337 Apr 1",
          entity,
          datedLand: { locations: 29, rank: 90, countryCount: 1566 },
        },
        "Political",
      ),
    ).toBe("Milan on 1337 Apr 1: 29\u00a0locations, #90 of 1,566 by land");
    expect(
      figureTitle(
        { pastDate: "1337 Apr 1", entity, datedLand: { locations: 0, rank: 900, countryCount: 9 } },
        "Political",
      ),
    ).toBe("Milan holds no land on 1337 Apr 1");
    expect(figureTitle({ pastDate: "1337 Apr 1" }, "Political")).toBe("The world on 1337 Apr 1");
  });

  it("names a location with its owner", () => {
    expect(
      figureTitle({ entity: { kind: "location", name: "London", owner: "England" } }, "Political"),
    ).toBe("London, in England");
  });
});

describe("columnPlaces", () => {
  it("gives equal values one place, and says how many share it", () => {
    expect(columnPlaces([5, 9, 5, 1])).toEqual([
      { place: 2, tied: 2 },
      { place: 1, tied: 1 },
      { place: 2, tied: 2 },
      { place: 4, tied: 1 },
    ]);
  });
});

describe("leaderDrivers", () => {
  it("says where the leader stands, and its lowest place", () => {
    expect(
      leaderDrivers(
        "France",
        [
          { label: "Wealth", place: 1, tied: 1 },
          { label: "Buildings", place: 1, tied: 1 },
          { label: "Income", place: 2, tied: 1 },
          { label: "Manpower", place: 18, tied: 1 },
        ],
        24,
      ),
    ).toBe("France is #1 of 24 on Wealth and Buildings, #2 on Income. Lowest: #18, Manpower.");
  });

  it("ignores a place that many rows share", () => {
    expect(leaderDrivers("France", [{ label: "Navy", place: 1, tied: 20 }], 24)).toBeNull();
  });
});

describe("the figures read true", () => {
  it("shows a dash for a country with no score points", () => {
    expect(formatScore(0)).toBe("\u2014");
    expect(formatScore(48)).toBe("48");
  });

  it("gives different values that read the same more digits", () => {
    expect(distinctInColumn([1.12, 1.14, 2], ["1.1", "1.1", "2.0"])).toEqual([
      "1.12",
      "1.14",
      "2.0",
    ]);
    expect(distinctInColumn([1.1, 1.1], ["1.1", "1.1"])).toEqual(["1.1", "1.1"]);
  });

  it("names no leader on equal figures", () => {
    expect(
      standingsFinding("rating", [
        { name: "A", value: 1.14, shown: "1.1" },
        { name: "B", value: 1.12, shown: "1.1" },
      ]),
    ).toBe("A and B share the lead on rating, with 1.1.");
  });

  it("has one number for each noun", () => {
    expect(countOf(1, "location")).toBe("1 location");
    expect(countOf(2, "location")).toBe("2 locations");
  });
});

describe("the map's title and a location's line", () => {
  it("names no single leader on equal figures", () => {
    expect(
      figureTitle(
        { leader: { name: "Egypt", shown: "5.2M", metric: "population", tiedWith: "Jaunpur" } },
        "Population",
      ),
    ).toBe("Egypt and Jaunpur share the lead on population, 5.2M");
  });

  it("does not say that a country leads on a gap", () => {
    expect(
      figureTitle(
        { leader: { name: "Egypt", shown: "5,005", metric: "tax base gap", largest: true } },
        "Wealth",
      ),
    ).toBe("Largest tax base gap: Egypt, 5,005");
  });

  it("gives a location's place in its country and the world", () => {
    expect(
      locationFinding(
        "Milan",
        "Milan",
        "development",
        { world: 30, worldTied: 1, country: 5, countryTied: 2 },
        { world: 23000, country: 142 },
      ),
    ).toBe("Milan is =#5 of 142 in Milan by development, #30 of 23,000 in the world.");
  });
});

describe("each mode crossed with each scope", () => {
  const modes = [
    "political",
    "control",
    "development",
    "stateEfficacy",
    "wealth",
    "unrealizedTaxBase",
    "population",
    "populationGrowth",
    "religion",
    "markets",
    "rgoLevel",
    "buildingLevels",
  ] as const;
  const base = { isEmpty: false, activeProfile: undefined, locationCount: 500 };
  const scopes = [
    { ...base, preset: "players", entityCount: 24 },
    { ...base, entityCount: 10 },
    { ...base, entityCount: 2 },
  ];
  const rowNoun: Partial<Record<(typeof modes)[number], string>> = {
    religion: "Religions",
    markets: "Markets",
  };

  it("has a heading that names what the rows are", () => {
    for (const mode of modes) {
      for (const scope of scopes) {
        const heading = captionHeading(mode, scope, true);
        const noun = rowNoun[mode];
        if (noun) {
          expect(heading.startsWith(noun), `${mode}: ${heading}`).toBe(true);
          expect(heading).toMatch(/land/);
        } else {
          expect(heading).toMatch(/^(Players|\d+ countries) by /);
        }
        expect(heading.endsWith(" by undefined")).toBe(false);
      }
    }
  });

  it("says that a religion leads on the land, and not that the players lead", () => {
    expect(
      figureTitle(
        {
          set: { name: "Players", land: "player land" },
          leader: { name: "Catholicism", shown: "31M", metric: "followers" },
        },
        "Religion",
      ),
    ).toBe("On player land: Catholicism leads on followers, 31M");
  });

  it("names both measures when the list has a total and the map a value per location", () => {
    expect(
      figureTitle(
        {
          leader: {
            name: "France",
            shown: "4,872",
            metric: "total development",
            mapMeasure: "development per location",
          },
        },
        "Development",
      ),
    ).toBe("Most total development: France, 4,872. Map: development per location");
  });

  it("has one colon in a sentence with a scope", () => {
    expect(
      figureTitle(
        {
          set: { name: "Players" },
          leader: { name: "France", shown: "1,022", metric: "total tax base gap", largest: true },
        },
        "Tax base gap",
      ),
    ).toBe("Players. Largest total tax base gap: France, 1,022");
  });
});

describe("lensFinding", () => {
  it("names who holds the most, and no leader on equal figures", () => {
    const row = (name: string, value: number) => ({ name, value, shown: String(value) });
    expect(lensFinding("Coffee", "RGO levels", [row("Egypt", 9), row("Yemen", 4)], "players")).toBe(
      "Egypt holds the most Coffee, 9 RGO levels, ahead of Yemen with 4.",
    );
    expect(lensFinding("Coffee", "RGO levels", [row("Egypt", 9), row("Yemen", 9)], "players")).toBe(
      "Egypt and Yemen hold the most Coffee, 9 RGO levels.",
    );
  });
});

describe("namedShareFinding", () => {
  it("names the rows, and makes no claim of a top tenth for a small scope", () => {
    const rows = [
      { name: "France", value: 50 },
      { name: "England", value: 30 },
      { name: "Hungary", value: 10 },
      { name: "Rome", value: 10 },
    ];
    expect(namedShareFinding(rows, "development", "player land")).toBe(
      "France, England and Hungary hold 90% of development on player land",
    );
  });

  it("has nothing to say about three rows or fewer", () => {
    expect(namedShareFinding([{ name: "A", value: 1 }], "development", "player land")).toBeNull();
  });
});

describe("currentJump", () => {
  const parts = (...tops: number[]) => tops.map((top, i) => ({ name: `part ${i}`, top }));

  it("is the last part past the line", () => {
    expect(currentJump(parts(-500, 30, 400), 40, false)).toBe("part 1");
  });

  it("is the first part before any has reached the line", () => {
    expect(currentJump(parts(100, 400), 40, false)).toBe("part 0");
  });

  it("is the last part at the end of the scroll, though it cannot reach the line", () => {
    expect(currentJump(parts(-500, -100, 300), 40, true)).toBe("part 2");
  });
});
