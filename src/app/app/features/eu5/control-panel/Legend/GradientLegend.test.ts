import { describe, expect, it } from "vitest";
import { legendTicks } from "./GradientLegend";

describe("legendTicks", () => {
  it("gives each tick of one legend one precision, and rounded ends", () => {
    expect(legendTicks("development", [0, 36.1, 72.2])).toEqual(["0", "36", "72"]);
    expect(legendTicks("development", [0, 50, 100])).toEqual(["0", "50", "100"]);
    expect(legendTicks("development", [0, 2.75, 5.5])).toEqual(["0", "2.8", "5.5"]);
  });

  it("gives each tick one unit, and a zero needs no unit", () => {
    expect(legendTicks("population", [0, 12_500, 25_000])).toEqual(["0", "13K", "25K"]);
    expect(legendTicks("wealth", [0, 1_750, 3_500])).toEqual(["0", "1.8K", "3.5K"]);
  });

  it("shows a ratio as a percent", () => {
    expect(legendTicks("control", [0, 0.5, 1])).toEqual(["0", "50%", "100%"]);
  });
});
