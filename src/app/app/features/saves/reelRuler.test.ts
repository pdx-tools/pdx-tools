import { describe, expect, it } from "vitest";
import { formatGameDate } from "./gameDate";
import { minStopGap, positionToStop, rulerEnds, rulerStops, stopToPosition } from "./reelRuler";

describe("reel ruler", () => {
  it("spaces saves by game date", () => {
    expect(rulerStops(["1444-01-01", "1454-01-01", "1544-01-01"])).toEqual([0, 0.1, 1]);
  });

  it("gives a lone save one stop", () => {
    expect(rulerStops(["1444-11-11"])).toEqual([0]);
  });

  it("keeps saves with the same date apart", () => {
    const stops = rulerStops(["1444-11-11", "1500-01-01", "1500-01-01", "1600-01-01"]);
    expect(stops[0]).toBe(0);
    expect(stops[3]).toBe(1);
    expect(stops[2] - stops[1]).toBeGreaterThanOrEqual(minStopGap(4) * 0.9);
  });

  it("spaces saves evenly when all have one date", () => {
    expect(rulerStops(["1521-03-01", "1521-03-01", "1521-03-01"])).toEqual([0, 0.5, 1]);
  });

  it("lets a click on each tick reach its own save", () => {
    const stops = rulerStops([
      "1444-11-11",
      "1500-01-01",
      "1500-01-01",
      "1500-01-02",
      "1600-01-01",
    ]);
    stops.forEach((stop, i) => {
      expect(Math.round(stopToPosition(stops, stop))).toBe(i);
    });
  });

  it("maps a position to a stop and back", () => {
    const stops = rulerStops(["1444-01-01", "1454-01-01", "1544-01-01"]);
    for (const position of [0, 0.25, 1, 1.5, 2]) {
      expect(stopToPosition(stops, positionToStop(stops, position))).toBeCloseTo(position);
    }
  });

  it("labels the ends with years, or with dates in a one-year campaign", () => {
    expect(rulerEnds("1444-11-11", "1521-03-01", formatGameDate)).toEqual(["1444", "1521"]);
    expect(rulerEnds("1521-01-01", "1521-09-01", formatGameDate)).toEqual([
      "1 January 1521",
      "1 September 1521",
    ]);
  });
});
