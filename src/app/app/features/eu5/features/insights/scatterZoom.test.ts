import { describe, expect, it } from "vitest";
import { linearZoom, logName, logZoom, zoomedAxes } from "./scatterZoom";

describe("linearZoom", () => {
  it("ends on round values just out of the box", () => {
    expect(linearZoom(1640, 4870)).toEqual({ min: 1500, max: 5000 });
    expect(linearZoom(22.7, 26.2)).toEqual({ min: 22.5, max: 26.5 });
  });

  it("keeps the ends of a box too small to round", () => {
    expect(linearZoom(0, Number.MIN_VALUE)).toEqual({ min: 0, max: Number.MIN_VALUE });
    expect(linearZoom(1.0000000000001, 1.0000000000002)).toEqual({
      min: 1.0000000000001,
      max: 1.0000000000002,
    });
  });

  it("does not go down to 0 from a box above it", () => {
    expect(linearZoom(497, 6300).min).toBeGreaterThan(0);
    expect(linearZoom(0, 37)).toEqual({ min: 0, max: 40 });
  });
});

describe("logZoom", () => {
  it("ends on 1, 2 or 5 times a power of 10", () => {
    expect(logZoom(66.5, 3780)).toEqual({ min: 50, max: 5000 });
    expect(logZoom(100, 1000)).toEqual({ min: 100, max: 1000 });
    expect(logZoom(10, 10.000000005)).toEqual({ min: 10, max: 10.000000005 });
    expect(logZoom(1e307, 1.1e308)).toEqual({ min: 1e307, max: 1.1e308 });
  });
});

describe("zoomedAxes", () => {
  const log = { type: "log", name: logName("Total Development") };
  const value = { type: "value", name: "Avg Dev" };

  it("makes a narrow zoom of a log axis linear, with its plain name", () => {
    const axes = zoomedAxes({ x: log, y: value }, { x: [497, 4870], y: [12.4, 37.5] });
    expect(axes.x).toMatchObject({ type: "value", name: "Total Development", min: 250, max: 5000 });
    expect(axes.y).toMatchObject({ type: "value", min: 10, max: 40 });
  });

  it("zooms a linear axis no closer than its tick text can show", () => {
    const axes = zoomedAxes({ x: value, y: value }, { x: [1_231_000, 1_233_000], y: [0, 40] });
    const { min, max } = axes.x as unknown as { min: number; max: number };
    expect(max - min).toBeGreaterThanOrEqual(0.05 * 1_233_000);
  });

  it("keeps a wide zoom of a log axis log", () => {
    const axes = zoomedAxes({ x: log, y: value }, { x: [3, 4870], y: [0, 40] });
    expect(axes.x).toMatchObject({ type: "log", name: log.name, min: 2, max: 5000 });
  });

  it("keeps a log axis log when the box has its floor", () => {
    const floored = { ...log, min: 10 };
    const axes = zoomedAxes({ x: floored, y: value }, { x: [10, 190], y: [0, 40] });
    expect(axes.x).toMatchObject({ type: "log", min: 10 });
    // A box from the left edge can come back a little under the floor.
    expect(
      zoomedAxes({ x: floored, y: value }, { x: [9.999999999, 190], y: [0, 40] }).x,
    ).toMatchObject({ min: 10 });
    // The widened end would reach the floor.
    expect(
      zoomedAxes({ x: { ...log, min: 100 }, y: value }, { x: [101, 103], y: [0, 40] }).x.type,
    ).toBe("log");
    // The rounded end would reach the floor.
    expect(zoomedAxes({ x: floored, y: value }, { x: [10.1, 190], y: [0, 40] }).x.type).toBe("log");
  });

  it("keeps two log axes on one kind of scale", () => {
    const axes = zoomedAxes({ x: log, y: log }, { x: [3, 4870], y: [200, 900] });
    expect([axes.x.type, axes.y.type]).toEqual(["log", "log"]);
  });
});
