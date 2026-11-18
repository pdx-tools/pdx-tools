import { describe, expect, it } from "vitest";
import { weightedMarketPrice } from "./observations";

describe("weightedMarketPrice", () => {
  it("weights the prices by recorded trade volume", () => {
    expect(
      weightedMarketPrice([
        { price: 10, totalTaken: 100 },
        { price: 20, totalTaken: 10 },
      ]),
    ).toBeCloseTo(1200 / 110);
  });

  it("skips unusable observations and keeps a valid zero price", () => {
    expect(
      weightedMarketPrice([
        undefined,
        { price: undefined, totalTaken: 10 },
        { price: Infinity, totalTaken: 10 },
        { price: 100, totalTaken: undefined },
        { price: 100, totalTaken: NaN },
        { price: 100, totalTaken: 0 },
        { price: 100, totalTaken: -1 },
        { price: 0, totalTaken: 20 },
      ]),
    ).toBe(0);
  });

  it("leaves a gap when no market recorded a usable price and volume", () => {
    expect(weightedMarketPrice([{ price: 10, totalTaken: 0 }])).toBeNull();
    expect(weightedMarketPrice([])).toBeNull();
  });
});
