import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  clampDate,
  dateFromDayNumber,
  dayNumber,
  daysBetween,
  formatLongDate,
  formatIsoDate,
  parseDate,
} from "./date";

describe("timeline date", () => {
  it("counts a year as 365 days", () => {
    expect(daysBetween({ year: 1337, month: 4, day: 1 }, { year: 1338, month: 4, day: 1 })).toBe(
      365,
    );
    expect(daysBetween({ year: 1340, month: 2, day: 28 }, { year: 1340, month: 3, day: 1 })).toBe(
      1,
    );
  });

  it("round trips every day of a year", () => {
    const start = dayNumber({ year: 1337, month: 1, day: 1 });
    for (let offset = 0; offset < 365 * 2; offset++) {
      const date = dateFromDayNumber(start + offset);
      expect(dayNumber(date)).toBe(start + offset);
    }
    expect(dateFromDayNumber(start + 364)).toEqual({ year: 1337, month: 12, day: 31 });
    expect(dateFromDayNumber(start + 365)).toEqual({ year: 1338, month: 1, day: 1 });
  });

  it("adds days across a year boundary in both directions", () => {
    expect(addDays({ year: 1337, month: 12, day: 31 }, 1)).toEqual({
      year: 1338,
      month: 1,
      day: 1,
    });
    expect(addDays({ year: 1338, month: 1, day: 1 }, -31)).toEqual({
      year: 1337,
      month: 12,
      day: 1,
    });
  });

  it("adds months and clamps the day", () => {
    expect(addMonths({ year: 1337, month: 1, day: 31 }, 1)).toEqual({
      year: 1337,
      month: 2,
      day: 28,
    });
    expect(addMonths({ year: 1337, month: 12, day: 5 }, 1)).toEqual({
      year: 1338,
      month: 1,
      day: 5,
    });
    expect(addMonths({ year: 1338, month: 1, day: 5 }, -1)).toEqual({
      year: 1337,
      month: 12,
      day: 5,
    });
    expect(addYears({ year: 1337, month: 4, day: 1 }, 10)).toEqual({
      year: 1347,
      month: 4,
      day: 1,
    });
  });

  it("clamps to the campaign", () => {
    const start = { year: 1337, month: 4, day: 1 };
    const end = { year: 1360, month: 12, day: 1 };
    expect(clampDate({ year: 1300, month: 1, day: 1 }, start, end)).toBe(start);
    expect(clampDate({ year: 1400, month: 1, day: 1 }, start, end)).toBe(end);
    const inside = { year: 1350, month: 1, day: 1 };
    expect(clampDate(inside, start, end)).toBe(inside);
  });

  it("formats year first", () => {
    expect(formatLongDate({ year: 1346, month: 6, day: 26 })).toBe("1346 Jun 26");
  });

  it("round-trips the wire format", () => {
    expect(formatIsoDate({ year: 1444, month: 11, day: 11 })).toBe("1444-11-11");
    expect(formatIsoDate({ year: 2, month: 1, day: 1 })).toBe("0002-01-01");
    expect(parseDate("1444-11-11")).toEqual({ year: 1444, month: 11, day: 11 });
    expect(parseDate("1444.11.11")).toEqual({ year: 1444, month: 11, day: 11 });
    expect(parseDate("1444.2.30")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});
