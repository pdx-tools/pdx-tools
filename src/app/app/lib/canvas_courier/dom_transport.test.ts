import { describe, expect, it } from "vitest";
import { canvasPhysicalSize } from "./dom_transport";

describe("canvasPhysicalSize", () => {
  it("uses a plausible device-pixel content box", () => {
    expect(canvasPhysicalSize(390, 260, 3, { inlineSize: 1170, blockSize: 780 })).toEqual({
      width: 1170,
      height: 780,
      scaleFactor: 3,
    });
  });

  it("rejects an emulated device-pixel box reported in CSS pixels", () => {
    expect(canvasPhysicalSize(390, 260, 3, { inlineSize: 390, blockSize: 260 })).toEqual({
      width: 1170,
      height: 780,
      scaleFactor: 3,
    });
  });

  it("allows one-pixel device rounding", () => {
    expect(canvasPhysicalSize(390.4, 260.4, 2, { inlineSize: 781, blockSize: 521 })).toEqual({
      width: 781,
      height: 521,
      scaleFactor: 2,
    });
  });

  it("calculates physical pixels when the browser does not report them", () => {
    expect(canvasPhysicalSize(390.4, 260.4, 2)).toEqual({
      width: 780,
      height: 520,
      scaleFactor: 2,
    });
  });
});
