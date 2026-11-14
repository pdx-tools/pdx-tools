import { describe, expect, it } from "vitest";
import type { GradientConfig } from "@/wasm/wasm_eu5";
import { gradientKey } from "./GradientLegend";

const scale = (max: number, clip?: GradientConfig["clip"]): GradientConfig => ({
  scale: "log",
  palette: "eu5",
  minValue: 0,
  midValue: max / 6,
  maxValue: max,
  clip,
});

describe("gradientKey", () => {
  it("marks the top of a clipped scale and states the land above it", () => {
    const clip = { share: 0.02, highest: 570_302 };
    const key = gradientKey("population", scale(124_491, clip), false);
    expect(key.ticks).toEqual(["0", "21K", "124K+"]);
    expect(key.note).toBe("2.0% of locations above 124K, highest 570K");
    expect(gradientKey("population", scale(124_491, clip), true).note).toBe(
      "2.0% of selected locations above 124K, highest 570K",
    );
  });

  it("gives growth its yearly unit, with or without a clip", () => {
    const growth = { ...scale(0.0074), scale: "linear" as const, midValue: 0.0037 };
    expect(gradientKey("populationGrowth", growth, false)).toEqual({
      ticks: ["0", "0.37%/yr", "0.74%/yr"],
      note: null,
    });
    const clipped = gradientKey(
      "populationGrowth",
      { ...growth, clip: { share: 0.05, highest: 0.0446 } },
      false,
    );
    expect(clipped.ticks[2]).toBe("0.74%/yr+");
    expect(clipped.note).toBe("5.0% of locations above 0.74%/yr, highest 4.5%/yr");
  });

  it("has no note when the scale reaches the highest value", () => {
    const key = gradientKey("control", { ...scale(1), scale: "linear", midValue: 0.5 }, false);
    expect(key.ticks).toEqual(["0", "50%", "100%"]);
    expect(key.note).toBeNull();
  });
});
