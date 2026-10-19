import { describe, expect, it } from "vitest";
import { makeBins } from "./TimeBar";

describe("makeBins", () => {
  it("splits a short war into calendar quarters", () => {
    const events = [{ date: "1939-09-01" }, { date: "1939-12-31" }, { date: "1940-01-01" }];
    const { bins, size } = makeBins("1939-08-15", "1940-02-13", events, 600);
    expect(size).toBe(3);
    expect(bins.map((x) => x.from)).toEqual(["1939-07-01", "1939-10-01", "1940-01-01"]);
    expect(bins.map((x) => x.events.length)).toEqual([1, 1, 1]);
    expect(bins[2].to).toBe("1940-04-01");
  });

  it("merges a long campaign into years to fit the width", () => {
    const { bins, size } = makeBins("1444-11-11", "1821-01-02", [], 600);
    expect(size).toBeGreaterThanOrEqual(12);
    expect(bins.length).toBeLessThanOrEqual(100);
    expect(bins[0].from.endsWith("-01-01")).toBe(true);
  });
});
