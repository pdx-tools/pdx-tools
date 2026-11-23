import { describe, expect, it } from "vitest";
import type { LineageCell } from "@/wasm/wasm_eu4";
import {
  NO_FOCUS,
  fitView,
  absentAt,
  colorRule,
  isGeneratedTag,
  keepRivals,
  rivalRows,
  withRivals,
  distinctTexts,
  escapeFocus,
  findKey,
  orderSince,
  pickCountry,
  placeRows,
  placeStandings,
  saveSpacing,
  saveYearLabels,
  standingsAt,
  subjectOf,
  valueScale,
} from "./history";
import type { LineRow } from "./history";

const cell = (value: number | null | "none"): LineageCell | null =>
  value === "none"
    ? { kind: "noRecord", tag: "AAA", held: 0 }
    : value === null
      ? null
      : { kind: "value", tag: "AAA", held: 0, value };
const row = (key: string, values: (number | null | "none")[], played = false): LineRow => ({
  key,
  cells: values.map(cell),
  played,
});

describe("valueScale", () => {
  it("starts at zero and leaves room above the largest value", () => {
    const scale = valueScale(10, 1121, true);
    expect(scale.lo).toBe(0);
    expect(scale.hi).toBeGreaterThanOrEqual(1121 * 1.03);
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks.at(-1)).toBe(scale.hi);
    expect(scale.ticks.length).toBeLessThanOrEqual(7);
  });

  it("puts a round tick at the top when the largest value is one", () => {
    const scale = valueScale(0, 1000, true);
    expect(scale.hi).toBeGreaterThan(1000);
  });

  it("fits a range away from zero", () => {
    const scale = valueScale(4000, 5200, false);
    expect(scale.lo).toBeGreaterThan(0);
    expect(scale.lo).toBeLessThanOrEqual(4000);
    expect(scale.hi).toBeGreaterThan(5200);
  });

  it("keeps small values exact", () => {
    expect(valueScale(0, 3.2, true).ticks.every((x) => String(x).length < 6)).toBe(true);
  });

  it("keeps zero in view and leaves room below a debt", () => {
    const debt = valueScale(-5000, -3000, true);
    expect(debt.hi).toBe(0);
    expect(debt.lo).toBeLessThan(-5000);
    const mixed = valueScale(-500, 2000, true);
    expect(mixed.lo).toBeLessThan(-500);
    expect(mixed.ticks).toContain(0);
    expect(valueScale(-0.5, -0.2, true).ticks.some((x) => Object.is(x, -0))).toBe(false);
  });
});

describe("standingsAt", () => {
  it("ranks the largest first, shares a rank on a tie and leaves out countries without a value", () => {
    const rows = [
      row("a", [5]),
      row("b", [9]),
      row("c", [5]),
      row("d", [null]),
      row("e", ["none"]),
      row("f", [1]),
    ];
    const standings = standingsAt(rows, 0);
    expect(standings.map((x) => [x.row.key, x.rank, x.tied])).toEqual([
      ["b", 1, false],
      ["a", 2, true],
      ["c", 2, true],
      ["f", 4, false],
    ]);
  });
});

describe("absentAt", () => {
  it("says when a country last or next has a value, and when the save has no record", () => {
    const rows = [
      row("ended", [1, 2, null]),
      row("late", [null, null, 3]),
      row("gap", [1, null, 3]),
      row("none", [1, "none", 2]),
      row("never", [null, null, null]),
      row("here", [1, 1, 1]),
    ];
    const notes = absentAt(rows, 1).map((x) => [x.row.key, x.note]);
    expect(notes).toEqual([
      ["late", { kind: "from", column: 2 }],
      ["gap", { kind: "between", until: 0, from: 2 }],
      ["none", { kind: "noRecord" }],
    ]);
    expect(absentAt(rows, 2).map((x) => [x.row.key, x.note])).toEqual([
      ["ended", { kind: "until", column: 1 }],
    ]);
  });
});

describe("placeRows", () => {
  it("leaves rows where they want to be when they do not overlap", () => {
    const { tops, push } = placeRows(
      [
        { want: 20, height: 20 },
        { want: 100, height: 20 },
      ],
      0,
      200,
    );
    expect(tops).toEqual([10, 90]);
    expect(push).toBe(0);
  });

  it("pushes overlapping rows apart around their mean and within the bounds", () => {
    const { tops, push } = placeRows(
      [
        { want: 100, height: 20 },
        { want: 100, height: 20 },
        { want: 100, height: 20 },
      ],
      0,
      200,
    );
    expect(tops).toEqual([70, 90, 110]);
    expect(push).toBe(20);
    const low = placeRows(
      [
        { want: 195, height: 20 },
        { want: 198, height: 20 },
      ],
      0,
      200,
    );
    expect(low.tops).toEqual([160, 180]);
  });
});

describe("colorRule", () => {
  const many = (n: number, played: number[] = []) =>
    Array.from({ length: n }, (_, i) => row(`c${i}`, [100 - i], played.includes(i)));

  it("colors all up to twelve countries", () => {
    const rows = many(12);
    const rule = colorRule(rows, standingsAt(rows, 0), null, []);
    expect(rule.inColor.size).toBe(12);
    expect(rule.label).toBe("All 12");
    // With no rows, such as while the first answer comes, there is no rule to name.
    expect(colorRule([], [], null, []).label).toBeNull();
  });

  it("colors the top five, the players, the subject and the pins above twelve", () => {
    const rows = many(20, [15]);
    const rule = colorRule(rows, standingsAt(rows, 0), "c18", ["c10"]);
    expect([...rule.inColor].sort()).toEqual(["c0", "c1", "c10", "c15", "c18", "c2", "c3", "c4"]);
    expect(rule.label).toBe("Top 5 and player");
  });

  it("never splits a tie at fifth and does not rank countries without a value", () => {
    const rows = [
      row("gone", [null]),
      ...Array.from({ length: 13 }, (_, i) => row(`c${i}`, [i < 4 ? 100 - i : i < 7 ? 50 : 10])),
    ];
    const rule = colorRule(rows, standingsAt(rows, 0), null, []);
    expect([...rule.inColor].sort()).toEqual(["c0", "c1", "c2", "c3", "c4", "c5", "c6"]);
    expect(rule.label).toBe("Top 5");
  });

  it("leaves out a tie at fifth that would color more than twelve, such as many at zero", () => {
    // Three countries hire mercenaries; seventeen have none.
    const rows = Array.from({ length: 20 }, (_, i) => row(`c${i}`, [i < 3 ? 10 - i : 0]));
    const rule = colorRule(rows, standingsAt(rows, 0), "c19", []);
    expect([...rule.inColor].sort()).toEqual(["c0", "c1", "c19", "c2"]);
    expect(rule.label).toBe("Top 5");
  });

  it("colors the followed country and its rivals in single player, the players in multiplayer", () => {
    // Each row holds its own key as its tag.
    const rows: LineRow[] = Array.from({ length: 20 }, (_, i) => ({
      key: `c${i}`,
      played: i === 15,
      cells: [{ kind: "value", tag: `c${i}`, held: 0, value: 100 - i }],
    }));
    const rivals = rivalRows(rows, ["c3", "c9"], 0);
    // c3 and c9 hold those tags at the column, so their rows are the rivals.
    const keys = new Set(["c3", "c9"]);
    expect(rivals).toEqual(keys);
    const solo = colorRule(rows, standingsAt(rows, 0), "c15", ["c1"], { keys, multiplayer: false });
    expect([...solo.inColor].sort()).toEqual(["c1", "c15", "c3", "c9"]);
    expect(solo.label).toBe("You and rivals");
    const followed = colorRule(rows, standingsAt(rows, 0), "c0", [], { keys, multiplayer: false });
    expect(followed.label).toBe("Followed and rivals");
    const multi = colorRule(rows, standingsAt(rows, 0), "c15", [], { keys, multiplayer: true });
    expect(multi.label).toBe("Top 5 and player");
  });

  it("finds a rival by the tag it held at the column, after a tag change too", () => {
    const formed: LineRow = {
      key: "ALO>NBI@1451",
      played: false,
      cells: [
        { kind: "value", tag: "ALO", held: 0, value: 1 },
        { kind: "value", tag: "NBI", held: 1, value: 2 },
      ],
    };
    const rows = [formed, row("MKU", [1, 1])];
    expect(rivalRows(rows, ["ALO"], 0)).toEqual(new Set(["ALO>NBI@1451"]));
    expect(rivalRows(rows, ["NBI"], 1)).toEqual(new Set(["ALO>NBI@1451"]));
    expect(rivalRows(rows, ["NBI"], 0)).toEqual(new Set());
  });

  it("asks for the rivals of the played countries and of the followed one", () => {
    const lineage = (...tags: string[]) => ({ tags: tags.map((tag) => ({ tag })) });
    const answer = [
      { lineage: lineage("NBI"), values: [["MAM"], ["MAM", "ADA"]], played: true },
      { lineage: lineage("TUR"), values: [null, ["VEN"]], played: false },
      { lineage: lineage("FRA"), values: [["ENG"]], played: false },
    ];
    expect(withRivals(["NBI", "TUR", "FRA"], answer, "TUR")).toEqual([
      "NBI",
      "TUR",
      "FRA",
      "MAM",
      "ADA",
      "VEN",
    ]);
    expect(withRivals(["NBI"], answer, null)).toEqual(["NBI", "MAM", "ADA"]);
    // A key stored before Castile formed Spain still finds the lineage.
    const spain = [
      {
        lineage: { tags: [{ tag: "CAS" }, { tag: "SPA", from: "1520-01-01" }] },
        values: [["FRA"]],
        played: false,
      },
    ];
    expect(withRivals(["CAS"], spain, "CAS")).toEqual(["CAS", "FRA"]);
  });

  it("tells the tags the game reuses from a country's own", () => {
    expect(["C03", "T12", "K00", "E01", "F99"].every(isGeneratedTag)).toBe(true);
    expect(["CAS", "D00", "C3", "TUR"].some(isGeneratedTag)).toBe(false);
  });

  it("keeps a country from outside the filter only while followed or a rival now", () => {
    const row = (key: string, ...tags: string[]) => ({
      key,
      played: false,
      lineage: { tags: tags.map((tag) => ({ tag })) },
      cells: [],
    });
    const rows = [row("NBI", "NBI"), row("MAM", "MAM"), row("ADA", "ADA"), row("TUR", "TUR")];
    const { chartRows, added } = keepRivals(rows, ["NBI"], new Set(["MAM"]), "TUR");
    // Adal, a dead former rival, goes; the Mamluks are a rival now; the Ottomans are followed.
    expect(chartRows.map((x) => x.key)).toEqual(["NBI", "MAM", "TUR"]);
    expect(added).toEqual(new Set(["MAM", "TUR"]));
    // The world total has no filter.
    expect(keepRivals([row("world")], null, new Set(), null).chartRows).toHaveLength(1);
  });

  it("colors every country when all of them were played", () => {
    const rows = Array.from({ length: 16 }, (_, i) => row(`c${i}`, [i], true));
    const rule = colorRule(rows, standingsAt(rows, 0), null, []);
    expect(rule.inColor.size).toBe(16);
    expect(rule.label).toBe("Players");
  });
});

describe("orderSince", () => {
  it("finds where the present order began", () => {
    const subject = [1, 5, 6, 7].map(cell);
    const rival = [2, 3, 4, 8].map(cell);
    expect(orderSince(subject, rival, 2)).toEqual({ sign: 1, since: 1, whole: false });
    expect(orderSince(subject, rival, 3)).toEqual({ sign: -1, since: 3, whole: false });
  });

  it("calls a run whole when it reaches back to where a value is missing", () => {
    const subject = [9, 5, 6].map(cell);
    const rival = [null, 3, 4].map(cell);
    expect(orderSince(subject, rival, 2)).toEqual({ sign: 1, since: 1, whole: true });
    expect(orderSince(subject, [null, null, 4].map(cell), 1)).toBeNull();
  });
});

describe("saveSpacing", () => {
  it("calls saves sparse over a five-year median and dots only gaps well over it", () => {
    const year = 365;
    const sparse = saveSpacing([0, 60, 125, 145, 180, 213, 251, 306].map((y) => y * year));
    expect(sparse.sparse).toBe(true);
    expect(sparse.long(55 * year)).toBe(true);
    expect(sparse.long(4 * year)).toBe(false);
    expect(sparse.long(150 * year)).toBe(true);
    const dense = saveSpacing(Array.from({ length: 80 }, (_, i) => i * year));
    expect(dense.sparse).toBe(false);
    expect(dense.long(2 * year)).toBe(false);
    expect(dense.long(6 * year)).toBe(true);
  });
});

describe("saveYearLabels", () => {
  it("keeps the selected year and the ends, and drops a year too close to a kept one", () => {
    // 1510, 1571, 1636, 1654, 1691: 1654 is too close to 1636.
    const xs = [0, 120, 250, 286, 360];
    expect(saveYearLabels(xs, 4, 40)).toEqual([0, 1, 2, 4]);
    expect(saveYearLabels(xs, 3, 40)).toEqual([0, 1, 3, 4]);
  });
});

describe("focus", () => {
  const rows = [row("a", [1], true), row("b", [1]), row("c", [1]), row("d", [1]), row("e", [1])];

  it("follows the one played country by default", () => {
    expect(subjectOf(NO_FOCUS, rows, false)).toBe("a");
    const two = [row("a", [1], true), row("b", [1], true)];
    expect(subjectOf(NO_FOCUS, two, false)).toBeNull();
  });

  it("has no default subject in multiplayer, where other players may be filtered out", () => {
    expect(subjectOf(NO_FOCUS, rows, true)).toBeNull();
  });

  it("keeps a chosen country when a newer save extends its lineage", () => {
    const later = [row("BRA>PRU@1701-01-18", [1], true), row("FRA", [1])];
    const focus = { subject: "BRA", released: false, pins: ["FRA"] };
    expect(subjectOf(focus, later, false)).toBe("BRA>PRU@1701-01-18");
    expect(findKey(later, "FRA>XXX@1800-01-01")).toBe("FRA");
    expect(findKey([row("A>B@1", [1]), row("A>C@2", [1])], "A")).toBeNull();
  });

  it("makes a click the subject without one, a pin with one, and releases on the subject", () => {
    const none = [row("a", [1]), row("b", [1])];
    const chosen = pickCountry(NO_FOCUS, none, "b", false);
    expect(subjectOf(chosen, none, false)).toBe("b");
    let focus = pickCountry(NO_FOCUS, rows, "b", false);
    expect(focus.pins).toEqual(["b"]);
    focus = pickCountry(focus, rows, "c", false);
    focus = pickCountry(focus, rows, "d", false);
    focus = pickCountry(focus, rows, "e", false);
    expect(focus.pins).toEqual(["c", "d", "e"]);
    focus = pickCountry(focus, rows, "d", false);
    expect(focus.pins).toEqual(["c", "e"]);
    const released = pickCountry(focus, rows, "a", false);
    expect(subjectOf(released, rows, false)).toBeNull();
    expect(released.pins).toEqual([]);
  });

  it("lets Escape clear the pins, then return the subject to its default", () => {
    const focus = { subject: "b", released: false, pins: ["c"] };
    const once = escapeFocus(focus);
    expect(once.pins).toEqual([]);
    expect(subjectOf(once, rows, false)).toBe("b");
    expect(subjectOf(escapeFocus(once), rows, false)).toBe("a");
  });
});

describe("distinctTexts", () => {
  it("adds a decimal only to figures that would otherwise read alike", () => {
    const coarse = (v: number) => `${Math.round(v)}K`;
    const fine = (v: number, digits: number) => `${v.toFixed(digits)}K`;
    expect(distinctTexts([75, 9.51, 10.49, 33, 33, null], coarse, fine)).toEqual([
      "75K",
      "9.5K",
      "10.5K",
      "33K",
      "33K",
      "",
    ]);
    expect(distinctTexts([75.021, 75.038], coarse, fine)).toEqual(["75.02K", "75.04K"]);
  });
});

describe("absentAt and the line", () => {
  it("names as until the column of the line's last value", () => {
    const line = row("ended", [1, 2, 3, null, null]);
    const [absence] = absentAt([line], 4);
    const last = line.cells.findLastIndex((cell) => cell !== null);
    expect(absence.note).toEqual({ kind: "until", column: last });
  });
});

describe("fitView", () => {
  // Read saves span days 0-100; saves not read yet reach day 400.
  const days = [0, 50, 100];
  it("keeps a view of every read save that is narrower than the axis", () => {
    expect(fitView([0, 150], days, [0, 400], 10)).toEqual([0, 150]);
    expect(fitView([0, 400], days, [0, 400], 10)).toBeNull();
  });
  it("widens a narrow view inside the axis", () => {
    expect(fitView([395, 400], days, [0, 400], 10)).toEqual([100, 400]);
  });
});

it("places rows from outside the filter by value, unranked, with ranks 1..n and no gap", () => {
  const ranked = standingsAt([row("A", [300]), row("B", [200]), row("C", [100])], 0);
  // R is a rival of the followed country F, which is itself from outside the filter.
  const unranked = standingsAt([row("R", [150]), row("F", [50])], 0);
  const placed = placeStandings(ranked, unranked, "F", new Set(["R"]));
  expect(placed.map((x) => [x.row.key, x.place])).toEqual([
    ["A", { kind: "rank", text: "1" }],
    ["B", { kind: "rank", text: "2" }],
    ["R", { kind: "rival" }],
    ["C", { kind: "rank", text: "3" }],
    ["F", { kind: "outside" }],
  ]);
  // The leaders take the values in the rows' order.
  expect(placed.map((x) => x.value)).toEqual([300, 200, 150, 100, 50]);
});
