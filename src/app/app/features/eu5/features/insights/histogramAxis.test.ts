import { describe, expect, it } from "vitest";
import { binEdges, histogramLabels, roundEdgePositions, roundYearOffsets } from "./histogramAxis";

const uniform = (start: number, step: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i) => start + i * step);

describe("binEdges", () => {
  it("ends on the right edge of the last bin", () => {
    expect(
      binEdges([
        { lo: 0, hi: 5 },
        { lo: 5, hi: 10 },
      ]),
    ).toEqual([0, 5, 10]);
  });
});

describe("roundEdgePositions", () => {
  const labels = (edges: number[]) => roundEdgePositions(edges).map((i) => edges[i]);

  it("labels round edges of 20 bins of 5", () => {
    expect(labels(uniform(0, 5, 20))).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("stays on round numbers when the first edge is not one", () => {
    expect(labels(uniform(5, 5, 19))).toEqual([20, 40, 60, 80, 100]);
  });

  it("labels each edge when they fit", () => {
    expect(labels([0, 5, 10])).toEqual([0, 5, 10]);
  });

  it("labels fractional edges", () => {
    expect(labels(uniform(0, 0.25, 16))).toEqual([0, 1, 2, 3, 4]);
  });

  it("labels the powers of 10 on a ladder", () => {
    expect(labels([0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000])).toEqual([0, 1, 10, 100, 1000]);
  });
});

describe("roundYearOffsets", () => {
  it("gives round years from 1337 to 1582", () => {
    const years = roundYearOffsets(-245, 1582).map((offset) => offset + 1582);
    expect(years).toEqual([1350, 1400, 1450, 1500, 1550]);
  });

  it("gives each year of a short history", () => {
    const years = roundYearOffsets(-3, 1340).map((offset) => offset + 1340);
    expect(years).toEqual([1337, 1338, 1339, 1340]);
  });
});

describe("histogramLabels", () => {
  const gutter = { left: 72, right: 24 };
  const place = (medianAt: number, p90At: number, plotWidth = 200) =>
    histogramLabels({
      median: { at: medianAt, chars: 11 },
      p90: { at: p90At, chars: 8 },
      plotWidth,
      gutter,
    });

  it("keeps the labels on one row, each going away from the other line", () => {
    expect(place(0.18, 0.34)).toEqual({ median: "right", p90: "left", stacked: false });
    expect(place(0.46, 0.7)).toEqual({ median: "right", p90: "left", stacked: false });
  });

  it("keeps one row when both lines are on one point", () => {
    expect(place(0.5, 0.5).stacked).toBe(false);
  });

  it("moves the p90 label before its line at the end of the plot", () => {
    expect(place(0.3, 0.95)).toEqual({ median: "right", p90: "right", stacked: false });
  });

  it("uses two rows only when the moved label would overlap", () => {
    expect(place(0.85, 0.95)).toEqual({ median: "right", p90: "right", stacked: true });
  });

  it("does not stack on a wide plot when the labels clear each other", () => {
    expect(place(0.7, 0.98, 516)).toEqual({ median: "right", p90: "right", stacked: false });
  });

  it("moves the median label after its line when the left gutter is too small", () => {
    const wide = histogramLabels({
      median: { at: 0, chars: 12 },
      p90: { at: 0.6, chars: 8 },
      plotWidth: 200,
      gutter,
    });
    expect(wide).toEqual({ median: "left", p90: "left", stacked: false });
  });
});
