import { describe, expect, it } from "vitest";
import { buildGoodsPriceArrowData, selectGoodsPriceTrajectoryKeys, weightedSlope } from "./Markets";
import type { GoodsPriceTrajectoryInput } from "./Markets";

function good(
  key: string,
  history: number[],
  defaultMarketPrice: number | undefined = 100,
): GoodsPriceTrajectoryInput {
  return {
    good: { key, name: key, colorHex: "" },
    history,
    defaultMarketPrice,
    weightedPrice: history.at(-1) ?? defaultMarketPrice ?? 0,
  };
}

describe("weightedSlope", () => {
  it("returns approximately zero for flat history", () => {
    expect(weightedSlope([10, 10, 10, 10])).toBeCloseTo(0);
  });

  it("returns a positive slope for rising history", () => {
    expect(weightedSlope([10, 11, 12, 13])).toBeGreaterThan(0);
  });

  it("returns a negative slope for falling history", () => {
    expect(weightedSlope([13, 12, 11, 10])).toBeLessThan(0);
  });

  it("uses histories shorter than the default window", () => {
    expect(weightedSlope([5, 8])).toBeCloseTo(3);
  });

  it("weights recent movement more heavily than older movement", () => {
    const lateSpike = weightedSlope([10, 10, 10, 20], 4, 0.5);
    const earlySpike = weightedSlope([20, 10, 10, 10], 4, 0.5);

    expect(lateSpike).toBeGreaterThan(Math.abs(earlySpike));
  });
});

describe("goods price trajectory arrows", () => {
  it("selects goods with known rising and falling histories", () => {
    const keys = selectGoodsPriceTrajectoryKeys([
      good("rising", [100, 101, 102, 103]),
      good("falling", [100, 99, 98, 97]),
      good("flat", [100, 100, 100, 100]),
    ]);

    expect(keys).toEqual(new Set(["rising", "falling"]));
  });

  it("excludes goods without enough history or a base price", () => {
    const keys = selectGoodsPriceTrajectoryKeys([
      good("no-history", [100]),
      {
        good: { key: "no-base", name: "no-base", colorHex: "" },
        history: [100, 101],
        defaultMarketPrice: undefined,
        weightedPrice: 101,
      },
      good("valid", [100, 101]),
    ]);

    expect(keys).toEqual(new Set(["valid"]));
  });

  it("caps selection at the top five rising and top five falling goods", () => {
    const rising = Array.from({ length: 12 }, (_, i) => good(`rising-${i}`, [100, 101 + i]));
    const falling = Array.from({ length: 12 }, (_, i) => good(`falling-${i}`, [100, 99 - i]));
    const keys = selectGoodsPriceTrajectoryKeys([...rising, ...falling]);

    expect(keys.size).toBe(10);
    expect(keys.has("rising-11")).toBe(true);
    expect(keys.has("rising-0")).toBe(false);
    expect(keys.has("falling-11")).toBe(true);
    expect(keys.has("falling-0")).toBe(false);
  });

  it("builds left-facing arrows for falling prices and right-facing arrows for rising prices", () => {
    const arrows = buildGoodsPriceArrowData([
      good("rising", [100, 101, 102], 100),
      good("falling", [100, 99, 98], 100),
    ]);

    const rising = arrows.find((arrow) => arrow.key === "rising");
    const falling = arrows.find((arrow) => arrow.key === "falling");
    expect(rising?.endX).toBeGreaterThan(rising?.startX ?? Infinity);
    expect(falling?.endX).toBeLessThan(falling?.startX ?? -Infinity);
  });
});
