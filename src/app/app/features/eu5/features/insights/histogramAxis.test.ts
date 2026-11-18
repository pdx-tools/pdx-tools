import { describe, expect, it } from "vitest";
import { binCoord, binTicks, histogramLabels, histogramXAxes, roundTicks } from "./histogramAxis";

/** `n` bins of width `step` from `start` */
const uniform = (start: number, step: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ lo: start + i * step, hi: start + (i + 1) * step }));

/** A log ladder as the workspace makes it: a zero bin, the values under 1, then 1-2-5 rungs */
const ladder = [
  { lo: 0, hi: 0 },
  { lo: 0, hi: 1 },
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500].map((lo, i, all) => ({
    lo,
    hi: all[i + 1] ?? 1000,
  })),
];

const labels = (bins: { lo: number; hi: number }[]) => roundTicks(binTicks(bins));

describe("binTicks", () => {
  it("ends on the right edge of the last bin", () => {
    expect(binTicks(uniform(0, 5, 2))).toEqual([
      { at: 0, value: 0 },
      { at: 1, value: 5 },
      { at: 2, value: 10 },
    ]);
  });

  it("puts a bin of one value in its middle, and once", () => {
    expect(binTicks(ladder).slice(0, 3)).toEqual([
      { at: 0.5, value: 0 },
      { at: 2, value: 1 },
      { at: 3, value: 2 },
    ]);
    expect(binTicks([{ lo: 3, hi: 3 }])).toEqual([{ at: 0.5, value: 3 }]);
  });
});

describe("roundTicks", () => {
  const values = (bins: { lo: number; hi: number }[]) => labels(bins).map((t) => t.value);

  it("labels round edges of 20 bins of 5", () => {
    expect(values(uniform(0, 5, 20))).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("stays on round numbers when the first edge is not one", () => {
    expect(values(uniform(5, 5, 19))).toEqual([20, 40, 60, 80, 100]);
  });

  it("labels negative and fractional edges", () => {
    expect(values(uniform(-100, 10, 20))).toEqual([-100, -50, 0, 50, 100]);
    expect(values(uniform(0, 0.1, 21)).map((v) => Number(v.toFixed(6)))).toEqual([
      0, 0.5, 1, 1.5, 2,
    ]);
  });

  it("labels each edge when they fit", () => {
    expect(values(uniform(0, 5, 2))).toEqual([0, 5, 10]);
  });

  it("labels the powers of 10 on a ladder", () => {
    expect(values(ladder)).toEqual([0, 1, 10, 100, 1000]);
  });
});

describe("histogramXAxes", () => {
  const texts = (axes: ReturnType<typeof histogramXAxes>) => {
    const valueAxis = axes[1] as {
      axisLabel: { customValues: number[]; formatter: (position: number) => string };
    };
    const { customValues, formatter } = valueAxis.axisLabel;
    return customValues.map(formatter);
  };

  it("falls back to the next form when two ticks read the same", () => {
    const compact = (v: number) => `${Math.round(v / 1000)}K`;
    expect(texts(histogramXAxes(uniform(10_000, 5, 4), [compact, String]))).toEqual([
      "10000",
      "10005",
      "10010",
      "10015",
      "10020",
    ]);
    expect(texts(histogramXAxes(uniform(0, 5000, 4), [compact, String]))).toEqual([
      "0K",
      "5K",
      "10K",
      "15K",
      "20K",
    ]);
  });
});

describe("binCoord", () => {
  it("puts a value at its place in its bin", () => {
    expect(binCoord(uniform(0, 5, 4), 7.5)).toBe(1.5);
    expect(binCoord(uniform(0, 5, 4), 20)).toBe(4);
  });

  it("puts zero in the middle of the zero bin", () => {
    expect(binCoord(ladder, 0)).toBe(0.5);
    expect(binCoord(ladder, 0.5)).toBe(1.5);
  });

  it("puts a value on a ladder at its place on a log scale", () => {
    // 3.2 is in the bin from 2 to 5, the fourth bin.
    expect(binCoord(ladder, 3.2)).toBeCloseTo(3 + Math.log(1.6) / Math.log(2.5));
  });
});

describe("histogramLabels", () => {
  const gutter = { left: 50, right: 20 };
  const place = (medianAt: number, p90At: number, plotWidth = 200) =>
    histogramLabels({
      median: { at: medianAt, width: 79 },
      p90: { at: p90At, width: 58 },
      plotWidth,
      gutter,
    });

  it("keeps the labels on one row, each going away from the other line", () => {
    expect(place(0.3, 0.4)).toEqual({ median: "right", p90: "left", stacked: false });
    expect(place(0.5, 0.5).stacked).toBe(false);
  });

  it("moves the p90 label before its line at the end of the plot", () => {
    expect(place(0.3, 0.95)).toEqual({ median: "right", p90: "right", stacked: false });
  });

  it("uses two rows only when the moved label would overlap", () => {
    expect(place(0.85, 0.95)).toEqual({ median: "right", p90: "right", stacked: true });
    expect(place(0.7, 0.98, 520).stacked).toBe(false);
  });

  it("moves the median label after its line at the start of the plot", () => {
    expect(place(0, 0.6)).toEqual({ median: "left", p90: "left", stacked: false });
  });
});
