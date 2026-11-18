import { describe, expect, it } from "vitest";
import { chartTheme, seriesColor, seriesColors } from "./echartsTheme";

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

describe("chartTheme", () => {
  it("leaves the charts of other games as they are", () => {
    expect(chartTheme("eu4")).toBeUndefined();
    expect(chartTheme(undefined)).toBeUndefined();
  });

  it("gives an EU5 value axis compact ticks", () => {
    const theme = chartTheme("eu5") as {
      valueAxis: { axisLabel: { formatter: (value: number) => string } };
      logAxis: { axisLabel: { formatter: (value: number) => string } };
    };
    expect(theme.valueAxis.axisLabel.formatter(25_000)).toBe("25K");
    expect(theme.logAxis.axisLabel.formatter(1_000_000)).toBe("1M");
  });
});
