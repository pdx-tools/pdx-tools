import { describe, expect, it } from "vitest";
import { pointLabel, pointsToSave } from "./yearlySeries";

describe("pointsToSave", () => {
  it("adds the figure of the save date after the last yearly sample", () => {
    expect(pointsToSave([10, 20], { year: 1408, month: 2, day: 2 }, 25)).toEqual([
      [1407, 10],
      [1408, 20],
      [1408 + 1 / 12 + 1 / 360, 25],
    ]);
  });

  it("replaces a sample of the same date", () => {
    expect(pointsToSave([10, 20], { year: 1408, month: 1, day: 1 }, 25)).toEqual([
      [1407, 10],
      [1408, 25],
    ]);
  });

  it("has the figure even with no record", () => {
    expect(pointsToSave([], { year: 1408, month: 1, day: 1 }, 25)).toEqual([[1408, 25]]);
  });
});

describe("pointLabel", () => {
  it("names a year or the save date", () => {
    expect(pointLabel(1407, "1408 Feb 2")).toBe("1407, yearly record");
    expect(pointLabel(1408.1, "1408 Feb 2")).toBe("1408 Feb 2, from the locations");
  });
});
