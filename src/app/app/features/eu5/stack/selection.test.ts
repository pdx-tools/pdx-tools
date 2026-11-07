import { describe, expect, it } from "vitest";
import { rankLabel, rankPosition } from "./selection";

describe("rankLabel", () => {
  it("marks a rank that other countries share", () => {
    expect(rankLabel(1, 461)).toBe("=#1");
    expect(rankLabel(5)).toBe("#5");
    expect(rankLabel(5, 1)).toBe("#5");
  });
});

describe("rankPosition", () => {
  it("puts the first rank at the end of the track and the last at the start", () => {
    expect(rankPosition(1, 646)).toBe(1);
    expect(rankPosition(646, 646)).toBeCloseTo(0);
    expect(rankPosition(1, 1)).toBe(1);
  });
});
