import { describe, expect, it } from "vitest";
import { trackNotchYears, trackPosition } from "@pdx.tools/timelapse";

const TRACK = { start: { year: 1444, month: 11, day: 11 }, end: { year: 1821, month: 1, day: 1 } };

describe("trackPosition", () => {
  it("puts a gap between saves where the calendar puts it", () => {
    const track = {
      start: { year: 1400, month: 1, day: 1 },
      end: { year: 1500, month: 1, day: 1 },
      saves: [],
    };
    expect(trackPosition(track, { year: 1410, month: 1, day: 1 })).toBeCloseTo(0.1);
    expect(trackPosition(track, { year: 1490, month: 1, day: 1 })).toBeCloseTo(0.9);
  });

  it("keeps a film of one date at the end", () => {
    const date = { year: 1500, month: 1, day: 1 };
    expect(trackPosition({ start: date, end: date, saves: [date] }, date)).toBe(1);
  });
});

describe("trackNotchYears", () => {
  it("uses the finest round step that leaves room between notches", () => {
    // 377 years over 1500px: a decade is 40px, a half century 200px.
    expect(trackNotchYears({ ...TRACK, saves: [] }, 1500)).toEqual([
      1450, 1500, 1550, 1600, 1650, 1700, 1750, 1800,
    ]);
  });

  it("leaves a track too short for any step bare", () => {
    expect(trackNotchYears({ ...TRACK, saves: [] }, 100)).toEqual([]);
  });
});
