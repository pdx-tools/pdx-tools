import { describe, expect, it } from "vitest";
import {
  dotLabel,
  labelOffset,
  logDomain,
  logPosition,
  logTick,
  scatterDots,
} from "./countryScatter";
import type { CountryRef } from "@/wasm/wasm_eu5";

describe("logDomain", () => {
  it("starts at the power of 10 under the smallest value", () => {
    const domain = logDomain([3, 40, 25_600]);
    expect(domain.floor).toBe(1);
    expect(domain.onFloor).toBe(0);
    expect(domain.ceiling).toBeGreaterThan(25_600);
  });

  it("puts zero and negative values one decade under the smallest value", () => {
    const domain = logDomain([0, -2, 3, 40]);
    expect(domain.floor).toBe(0.1);
    expect(domain.onFloor).toBe(2);
    expect(logPosition(0, domain)).toBe(0.1);
    expect(logPosition(-2, domain)).toBe(0.1);
    expect(logPosition(3, domain)).toBe(3);
  });

  it("accepts values with none above zero", () => {
    const domain = logDomain([0, 0]);
    expect(domain.onFloor).toBe(2);
    expect(domain.ceiling).toBeGreaterThan(domain.floor);
  });
});

describe("logTick", () => {
  it("names the floor by what it holds", () => {
    expect(logTick(0.1, logDomain([0, 3]))).toBe("0");
    expect(logTick(0.1, logDomain([-1, 3]))).toBe("≤0");
    expect(logTick(10_000, logDomain([0, 3]))).toBe("10K");
  });

  it("gives a real value at the floor when no value is on it", () => {
    expect(logTick(1, logDomain([3]))).toBe("1");
  });
});

describe("scatterDots", () => {
  const row = (tag: string, x: number) => ({ tag, name: `${tag} name`, x, y: 1, color: "#000" });

  it("labels the five largest and the selected countries, and draws them last", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((tag, i) => row(tag, 7 - i));
    const dots = scatterDots(rows, logDomain(rows.map((r) => r.x)), [{ tag: "G" } as CountryRef]);
    const labelled = dots.filter((d) => d.label.show).map((d) => d.tag);
    expect(labelled.sort()).toEqual(["A", "B", "C", "D", "E", "G"]);
    expect(dots[0].tag).toBe("F");
  });

  it("colours only the labelled dots and the player, and the highest come first", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((tag, i) => ({
      ...row(tag, 7 - i),
      y: i,
      player: tag === "G",
    }));
    const dots = scatterDots(rows, logDomain(rows.map((r) => r.x)), []);
    expect(dots[0].tag).toBe("F");
    expect(dots[0].itemStyle).toBeUndefined();
    expect(dots.find((d) => d.tag === "A")?.itemStyle?.color).toBe("#000");
    expect(dots[1].tag).toBe("G");
    expect(dots[1].label.show).toBe(true);
  });

  it("keeps a country at zero in the data", () => {
    const rows = [row("A", 0), row("B", 5)];
    const dots = scatterDots(rows, logDomain([0, 5]), []);
    expect(dots).toHaveLength(2);
    expect(dots.find((d) => d.tag === "A")?.value[0]).toBe(0.1);
    expect(dots.find((d) => d.tag === "A")?.x).toBe(0);
  });
});

describe("labelOffset", () => {
  const dot = { x: 50, y: 50, width: 8, height: 8 };
  const label = { x: 40, y: 34, width: 28, height: 12 };

  it("keeps the place over the dot when it is free", () => {
    expect(labelOffset(label, dot, [])).toEqual({ dx: 0, dy: 0 });
  });

  it("moves a label that would overlap another, and the result overlaps nothing", () => {
    const placed = [{ x: 42, y: 36, width: 28, height: 12 }];
    const { dx, dy } = labelOffset(label, dot, placed);
    const moved = { ...label, x: label.x + dx, y: label.y + dy };
    expect(moved.x < 70 && 42 < moved.x + 28 && moved.y < 48 && 36 < moved.y + 12).toBe(false);
  });
});

describe("dotLabel", () => {
  it("uses the name for a generated tag", () => {
    expect(dotLabel("FRA", "France")).toBe("FRA");
    expect(dotLabel("AAA67", "Lanka")).toBe("Lanka");
  });
});
