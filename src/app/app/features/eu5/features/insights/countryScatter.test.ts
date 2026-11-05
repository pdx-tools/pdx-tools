import { describe, expect, it } from "vitest";
import {
  dotLabel,
  labelPlace,
  logDomain,
  logPosition,
  logTick,
  scatterDots,
} from "./countryScatter";
import type { LabelRect } from "./countryScatter";
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

  it("gives a label to the save's country, and the selection chooses its place first", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((tag, i) => ({
      ...row(tag, 7 - i),
      id: i,
    }));
    const dots = scatterDots(rows, logDomain(rows.map((r) => r.x)), [], 6);
    expect(dots.find((d) => d.tag === "G")?.label.show).toBe(true);
    expect(dots[dots.length - 1].tag).toBe("G");
  });

  it("colours a player and gives it no label on its own", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((tag, i) => ({
      ...row(tag, 7 - i),
      player: tag === "G",
    }));
    const dots = scatterDots(rows, logDomain(rows.map((r) => r.x)), []);
    const player = dots.find((d) => d.tag === "G");
    expect(player?.itemStyle?.color).toBe("#000");
    expect(player?.label.show).toBe(false);
    expect(dots.find((d) => d.tag === "F")?.itemStyle).toBeUndefined();
  });

  it("uses the total to find the largest when the x axis is not the total", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((tag, i) => ({
      ...row(tag, 1 + i),
      size: 7 - i,
    }));
    const dots = scatterDots(rows, logDomain(rows.map((r) => r.x)), []);
    expect(
      dots
        .filter((d) => d.label.show)
        .map((d) => d.tag)
        .sort(),
    ).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("names a dot by the country's name, with no word for a player", () => {
    const dots = scatterDots([{ ...row("HUN", 5), player: true }], logDomain([5]), []);
    expect(dots[0].dotLabel).toBe("HUN name");
  });

  it("keeps a country at zero in the data", () => {
    const rows = [row("A", 0), row("B", 5)];
    const dots = scatterDots(rows, logDomain([0, 5]), []);
    expect(dots).toHaveLength(2);
    expect(dots.find((d) => d.tag === "A")?.value[0]).toBe(0.1);
    expect(dots.find((d) => d.tag === "A")?.x).toBe(0);
  });
});

describe("labelPlace", () => {
  const dot = { x: 50, y: 50, width: 10, height: 10 };
  const overlap = (a: LabelRect, b: LabelRect) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it("goes to the right of a dot when that is free", () => {
    const place = labelPlace(dot, 30, 13, []);
    expect(place?.x).toBeGreaterThan(dot.x + dot.width);
  });

  it("reads back into the plot near the end of the axis", () => {
    const place = labelPlace(dot, 30, 13, [], 0.9);
    expect(place && place.x + place.width).toBeLessThanOrEqual(dot.x);
  });

  it("finds a place that overlaps nothing", () => {
    const placed = [labelPlace(dot, 30, 13, []) as LabelRect];
    const place = labelPlace(dot, 30, 13, placed) as LabelRect;
    expect(overlap(place, placed[0])).toBe(false);
  });

  it("gives way when no place is free", () => {
    const placed = [{ x: 0, y: 0, width: 200, height: 200 }];
    expect(labelPlace(dot, 30, 13, placed)).toBeNull();
  });
});

describe("dotLabel", () => {
  it("uses the name for a generated tag", () => {
    expect(dotLabel("FRA", "France")).toBe("FRA");
    expect(dotLabel("AAA67", "Lanka")).toBe("Lanka");
  });
});
