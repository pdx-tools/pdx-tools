import { describe, expect, it } from "vitest";
import {
  formatCompactIn,
  formatCount,
  formatExact,
  formatLevel,
  formatMetric,
  formatFixed,
  formatFixedPercent,
  formatPercent,
  formatRate,
  formatScale,
  formatTick,
} from "./format";

describe("formatMetric", () => {
  it("has one decimal in each value, so that the decimal column lines up", () => {
    expect(formatMetric(72.24)).toBe("72.2");
    expect(formatMetric(958.4)).toBe("958.4");
    expect(formatMetric(5.4)).toBe("5.4");
    expect(formatMetric(9_080)).toBe("9.1K");
    expect(formatMetric(1_570)).toBe("1.6K");
    expect(formatMetric(14_253)).toBe("14.3K");
    expect(formatMetric(25_500)).toBe("25.5K");
    expect(formatMetric(232_000)).toBe("232.0K");
    expect(formatMetric(22_920_000)).toBe("22.9M");
    expect(formatMetric(1_230_000_000)).toBe("1.2B");
  });

  it("moves to the next unit when rounding reaches it", () => {
    expect(formatMetric(960)).toBe("960.0");
    expect(formatMetric(999.96)).toBe("1.0K");
    expect(formatMetric(999_960)).toBe("1.0M");
    expect(formatMetric(99.96)).toBe("100.0");
  });

  it("gives a true minus sign, and a small value is not zero", () => {
    expect(formatMetric(-2_200)).toBe("−2.2K");
    expect(formatMetric(0)).toBe("0.0");
    expect(formatMetric(0.001)).toBe("<0.1");
    expect(formatMetric(-0.001)).toBe("−<0.1");
  });
});

describe("formatCount", () => {
  it("gives an integer under 1,000 and a compact value after it", () => {
    expect(formatCount(958)).toBe("958");
    expect(formatCount(958.4)).toBe("958");
    expect(formatCount(45)).toBe("45");
    expect(formatCount(7)).toBe("7");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(22_894)).toBe("22.9K");
  });
});

describe("formatLevel", () => {
  it("keeps a whole level whole", () => {
    expect(formatLevel(17)).toBe("17");
    expect(formatLevel(16.52)).toBe("16.5");
  });
});

describe("formatScale", () => {
  it("gives one decimal for each value", () => {
    expect(formatScale(100)).toBe("100.0");
    expect(formatScale(-5.14)).toBe("−5.1");
  });
});

describe("formatPercent", () => {
  it("has one decimal, and a small share is not zero", () => {
    expect(formatPercent(0.953)).toBe("95.3%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(0.0346)).toBe("3.5%");
    expect(formatPercent(0.0004)).toBe("<0.1%");
  });
});

describe("formatRate", () => {
  it("has two decimals and a sign", () => {
    expect(formatRate(0.0079)).toBe("+0.79%");
    expect(formatRate(-0.005)).toBe("\u22120.50%");
    expect(formatRate(0)).toBe("0.00%");
  });
});

describe("formatExact", () => {
  it("gives the full value behind a compact figure", () => {
    expect(formatExact(12073.9)).toBe("12,073.9");
    expect(formatExact(14252.733)).toBe("14,252.73");
    expect(formatExact(-5.1)).toBe("\u22125.1");
    expect(formatExact(958)).toBe("958");
  });
});

describe("formatTick", () => {
  it("gives a round tick with no zeros at the end", () => {
    expect(formatTick(0.5)).toBe("0.5");
    expect(formatTick(20)).toBe("20");
    expect(formatTick(5_000)).toBe("5K");
    expect(formatTick(1_500)).toBe("1.5K");
    expect(formatTick(10_000_000)).toBe("10M");
    expect(formatTick(0)).toBe("0");
    expect(formatTick(-2_000)).toBe("−2K");
  });
});

describe("formatFixed", () => {
  it("keeps one number of decimals, so place values align", () => {
    expect(formatFixed(95.82, 1)).toBe("95.8");
    expect(formatFixed(465, 1)).toBe("465.0");
    expect(formatFixed(-5.1, 1)).toBe("\u22125.1");
    expect(formatFixed(-0.01, 1)).toBe("0.0");
  });
});

describe("formatFixedPercent", () => {
  it("has one decimal, and a small share is not zero", () => {
    expect(formatFixedPercent(0.949)).toBe("94.9%");
    expect(formatFixedPercent(0.00002)).toBe("<0.1%");
    expect(formatFixedPercent(0)).toBe("0.0%");
    expect(formatFixedPercent(0.0017)).toBe("0.2%");
  });
});

describe("formatCompactIn", () => {
  it("has whole numbers with no unit in a column under 10,000", () => {
    expect(formatCompactIn(877.8, 1600)).toBe("878");
    expect(formatCompactIn(1600, 1600)).toBe("1,600");
    expect(formatCompactIn(-500, 2000)).toBe("\u2212500");
  });

  it("has a unit from 10,000, and whole numbers under 1,000", () => {
    expect(formatCompactIn(387_000, 21_700_000)).toBe("387.0K");
    expect(formatCompactIn(9700, 21_700_000)).toBe("9.7K");
    expect(formatCompactIn(958, 21_700_000)).toBe("958");
    expect(formatCompactIn(958, 25_500)).toBe("958");
  });

  it("keeps the decimal in a column under 100", () => {
    expect(formatCompactIn(96.3, 99)).toBe("96.3");
  });
});
