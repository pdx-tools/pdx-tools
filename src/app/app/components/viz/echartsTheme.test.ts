import { describe, expect, it } from "vitest";
import { seriesColor, seriesColors } from "./echartsTheme";

describe("seriesColor", () => {
  it("returns colors within the validated palette", () => {
    expect(seriesColors.map((_, index) => seriesColor(index))).toEqual(seriesColors);
  });

  it.each([-1, seriesColors.length, 1.5, Number.NaN])(
    "rejects an invalid series index: %s",
    (index) => {
      expect(() => seriesColor(index)).toThrow(RangeError);
    },
  );
});
