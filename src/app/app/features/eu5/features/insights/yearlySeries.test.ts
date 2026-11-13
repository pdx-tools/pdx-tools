import { describe, expect, it } from "vitest";
import { pointLabel, pointsToSave, roundYears, yearOfDate } from "./yearlySeries";

const record = (lastYear: number, people: number[]) => ({ lastYear, people });

describe("pointsToSave", () => {
  it("adds the figure of the save date after the last yearly sample", () => {
    const save = { year: 1408, month: 2, day: 2 };
    expect(pointsToSave(record(1408, [10, 20]), save, 25)).toEqual([
      [1407, 10],
      [1408, 20],
      [yearOfDate(save), 25],
    ]);
    expect(yearOfDate(save)).toBeCloseTo(1408 + 32 / 365);
  });

  it("replaces the sample of the same date", () => {
    expect(pointsToSave(record(1408, [10, 20]), { year: 1408, month: 1, day: 1 }, 25)).toEqual([
      [1407, 10],
      [1408, 25],
    ]);
  });

  it("dates a record that stopped before the save by its own last year", () => {
    const save = { year: 1455, month: 1, day: 1 };
    expect(pointsToSave(record(1340, [10, 20]), save, 0)).toEqual([
      [1339, 10],
      [1340, 20],
      [1455, 0],
    ]);
  });

  it("has the figure even with no record", () => {
    expect(pointsToSave(record(0, []), { year: 1408, month: 1, day: 1 }, 25)).toEqual([[1408, 25]]);
  });
});

describe("pointLabel", () => {
  it("names a year or the save date", () => {
    const save = { year: 1408, month: 2, day: 2 };
    expect(pointLabel(1407, save)).toBe("1407");
    expect(pointLabel(yearOfDate(save), save)).toBe("1408 Feb 2");
    expect(pointLabel(1408, { year: 1408, month: 1, day: 1 })).toBe("1408 Jan 1");
  });
});

describe("roundYears", () => {
  it("gives round years from 1337 to a save in 1617", () => {
    expect(roundYears(1337, 1617.25)).toEqual([1350, 1400, 1450, 1500, 1550, 1600]);
  });

  it("gives each year of a short history", () => {
    expect(roundYears(1337, 1340)).toEqual([1337, 1338, 1339, 1340]);
  });

  it("gives centuries to a long history", () => {
    expect(roundYears(1337, 1837)).toEqual([1400, 1500, 1600, 1700, 1800]);
  });
});
