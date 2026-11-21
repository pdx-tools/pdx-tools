import { describe, expect, it } from "vitest";
import type { LineageCell } from "@/wasm/wasm_eu4";
import {
  NO_FOCUS,
  absentAt,
  colorRule,
  escapeFocus,
  orderSince,
  pickCountry,
  placeRows,
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
    expect(rule.label).toBeNull();
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
    expect(sparse.long(55 * year)).toBe(false);
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
    expect(subjectOf(NO_FOCUS, rows)).toBe("a");
    const two = [row("a", [1], true), row("b", [1], true)];
    expect(subjectOf(NO_FOCUS, two)).toBeNull();
  });

  it("makes a click the subject without one, a pin with one, and releases on the subject", () => {
    const none = [row("a", [1]), row("b", [1])];
    const chosen = pickCountry(NO_FOCUS, none, "b");
    expect(subjectOf(chosen, none)).toBe("b");
    let focus = pickCountry(NO_FOCUS, rows, "b");
    expect(focus.pins).toEqual(["b"]);
    focus = pickCountry(focus, rows, "c");
    focus = pickCountry(focus, rows, "d");
    focus = pickCountry(focus, rows, "e");
    expect(focus.pins).toEqual(["c", "d", "e"]);
    focus = pickCountry(focus, rows, "d");
    expect(focus.pins).toEqual(["c", "e"]);
    const released = pickCountry(focus, rows, "a");
    expect(subjectOf(released, rows)).toBeNull();
    expect(released.pins).toEqual([]);
  });

  it("lets Escape clear the pins, then return the subject to its default", () => {
    const focus = { subject: "b", released: false, pins: ["c"] };
    const once = escapeFocus(focus);
    expect(once.pins).toEqual([]);
    expect(subjectOf(once, rows)).toBe("b");
    expect(subjectOf(escapeFocus(once), rows)).toBe("a");
  });
});
