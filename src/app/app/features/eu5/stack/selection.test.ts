import { describe, expect, it } from "vitest";
import { percentileOf, rankLabel } from "./selection";

describe("rankLabel", () => {
  it("marks a rank that other countries share", () => {
    expect(rankLabel(1, 461)).toBe("=#1");
    expect(rankLabel(5)).toBe("#5");
    expect(rankLabel(5, 1)).toBe("#5");
  });
});

describe("percentileOf", () => {
  it("puts the first rank at the end of the track and the last at the start", () => {
    expect(percentileOf(1, 646)).toBe(1);
    expect(percentileOf(646, 646)).toBe(0);
    expect(percentileOf(1, 1)).toBe(1);
  });
});
