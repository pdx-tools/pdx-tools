import { describe, expect, it } from "vitest";
import { buildDensity, densityLevel } from "./timelineScale";

describe("densityLevel", () => {
  it("spans the floor to the busiest bucket", () => {
    const level = densityLevel([0, 1, 10, 100]);
    expect(level(1)).toBe(0);
    expect(level(10)).toBeCloseTo(0.5);
    expect(level(100)).toBe(1);
  });

  it("keeps a spread when every bucket is large", () => {
    // Casualties: thousands in a quiet year, millions in a great war.
    const level = densityLevel([2_000, 20_000, 200_000, 2_000_000]);
    expect(level(20_000)).toBeCloseTo(1 / 3);
    expect(level(200_000)).toBeCloseTo(2 / 3);
  });

  it("does not let one stray small bucket flatten the rest", () => {
    const counts = [5, ...Array.from({ length: 20 }, (_, i) => 10_000 * (i + 1))];
    const level = densityLevel(counts);
    expect(level(5)).toBe(0);
    expect(level(10_000)).toBe(0);
    expect(level(100_000)).toBeGreaterThan(0.6);
  });

  it("fills a strip whose buckets are all equal", () => {
    expect(densityLevel([0, 7, 7])(7)).toBe(1);
    expect(densityLevel([0, 0])(0)).toBe(0);
  });
});

describe("buildDensity", () => {
  it("buckets changes and records the first day of each bar", () => {
    const bars = buildDensity([0, 1, 50, 99], [1, 1, 4, 2], 100, 100, 50);
    expect(bars).toEqual([
      { x: 0, w: 50, level: 0, firstDay: 0 },
      { x: 50, w: 50, level: 1, firstDay: 50 },
    ]);
  });

  it("is empty without changes or room", () => {
    expect(buildDensity([], [], 100, 100, 2)).toEqual([]);
    expect(buildDensity([1], [1], 0, 100, 2)).toEqual([]);
  });
});
