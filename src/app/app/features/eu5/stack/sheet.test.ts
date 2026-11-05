import { describe, expect, it } from "vitest";
import { cycleSnap, settleSnap, sheetHeight, stepSnap } from "./sheet";

describe("sheetHeight", () => {
  it("gives three sizes in order on a phone", () => {
    expect(sheetHeight("map", 844)).toBe(253);
    expect(sheetHeight("half", 844)).toBe(506);
    expect(sheetHeight("sheet", 844)).toBe(641);
  });

  it("keeps the map in view on a short phone, and the sizes stay in order", () => {
    expect(568 - sheetHeight("sheet", 568)).toBeGreaterThanOrEqual(200);
    expect(sheetHeight("half", 568)).toBeLessThanOrEqual(sheetHeight("sheet", 568));
    expect(sheetHeight("map", 568)).toBeLessThanOrEqual(sheetHeight("half", 568));
  });
});

describe("settleSnap", () => {
  it("goes to the nearest size after a slow release", () => {
    expect(settleSnap(300, 0, 844)).toBe("map");
    expect(settleSnap(500, 0, 844)).toBe("half");
    expect(settleSnap(620, 0.1, 844)).toBe("sheet");
  });

  it("goes to the next size in the direction of a flick", () => {
    expect(settleSnap(300, 0.8, 844)).toBe("half");
    expect(settleSnap(500, -0.8, 844)).toBe("map");
    expect(settleSnap(565, 0.8, 844)).toBe("sheet");
  });

  it("stays at an end when a flick has no next size", () => {
    expect(settleSnap(641, 0.8, 844)).toBe("sheet");
    expect(settleSnap(253, -0.8, 844)).toBe("map");
  });
});

describe("the keyboard and the tap", () => {
  it("steps up and down and stops at the ends", () => {
    expect(stepSnap("half", 1)).toBe("sheet");
    expect(stepSnap("sheet", 1)).toBe("sheet");
    expect(stepSnap("half", -1)).toBe("map");
    expect(stepSnap("map", -1)).toBe("map");
  });

  it("cycles through all sizes", () => {
    expect(cycleSnap("map")).toBe("half");
    expect(cycleSnap("half")).toBe("sheet");
    expect(cycleSnap("sheet")).toBe("map");
  });
});
