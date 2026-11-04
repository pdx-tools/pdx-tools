import { describe, expect, it } from "vitest";
import { rampColor } from "../control-panel/Legend/GradientLegend";

const css =
  "linear-gradient(to right, rgb(0, 0, 0) 0.00%, rgb(100, 200, 50) 50.00%, rgb(200, 0, 100) 100.00%)";

describe("rampColor", () => {
  it("interpolates between the two stops around a position", () => {
    expect(rampColor(css, 0.25)).toBe("rgb(50,100,25)");
    expect(rampColor(css, 0.75)).toBe("rgb(150,100,75)");
  });

  it("holds the ends", () => {
    expect(rampColor(css, 0)).toBe("rgb(0,0,0)");
    expect(rampColor(css, 1)).toBe("rgb(200,0,100)");
  });

  it("has no colour for a gradient it cannot read", () => {
    expect(rampColor("none", 0.5)).toBeUndefined();
  });
});
